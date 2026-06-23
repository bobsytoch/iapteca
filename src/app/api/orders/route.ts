import { NextResponse } from "next/server";
import {
  connectDB,
  OrderModel,
  MedicationModel,
  PromoCodeModel,
} from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import mongoose from "mongoose";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";

export async function GET(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "GET",
    path: "/api/orders",
  });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram(
      "http_request_duration_ms",
      Date.now() - startTime,
      { path: "/api/orders" },
    );
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }
  await connectDB();
  const { searchParams } = new URL(req.url);
  const filter =
    user.role === "ADMIN" && searchParams.get("admin")
      ? {}
      : { user: user._id };
  const orders = await OrderModel.find(filter).sort({ createdAt: -1 });

  metrics.observeHistogram("http_request_duration_ms", Date.now() - startTime, {
    path: "/api/orders",
  });
  return NextResponse.json(orders);
}

interface OrderItemInput {
  medication: string;
  quantity: number;
  price: number;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "POST",
    path: "/api/orders",
  });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram(
      "http_request_duration_ms",
      Date.now() - startTime,
      { path: "/api/orders" },
    );
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }

  await connectDB();

  const { items, promoCode }: { items: OrderItemInput[]; promoCode?: string } =
    await req.json();

  if (!items || items.length === 0) {
    metrics.observeHistogram(
      "http_request_duration_ms",
      Date.now() - startTime,
      { path: "/api/orders" },
    );
    return NextResponse.json({ error: "Кошик порожній" }, { status: 400 });
  }

  // Calculate total server-side to prevent price manipulation
  let rawTotal = 0;
  for (const item of items) {
    const med = await MedicationModel.findById(item.medication).lean();
    if (!med) {
      metrics.observeHistogram(
        "http_request_duration_ms",
        Date.now() - startTime,
        { path: "/api/orders" },
      );
      return NextResponse.json(
        { error: "Препарат не знайдено" },
        { status: 400 },
      );
    }
    rawTotal += med.price * item.quantity;
  }

  // Validate promo code – do NOT increment usage here; only after the order is created
  let discountPercent = 0;
  let promoId: string | null = null;
  let promoUsageLimit = 0;
  if (promoCode) {
    const promo = await PromoCodeModel.findOne({ code: promoCode }).lean();
    if (
      promo &&
      new Date(promo.expiresAt) > new Date() &&
      promo.usedCount < promo.usageLimit
    ) {
      discountPercent = promo.discountPercent;
      promoId = (promo._id as { toString(): string }).toString();
      promoUsageLimit = promo.usageLimit;
    }
  }

  const finalTotal = parseFloat(
    Math.max(rawTotal - (rawTotal * discountPercent) / 100, 0).toFixed(2),
  );

  const MAX_RETRIES = 50;
  let retryCount = 0;

  // Fast path for single-item carts (no MongoDB session needed)
  if (items.length === 1) {
    while (retryCount < MAX_RETRIES) {
      try {
        const item = items[0];
        const med = await MedicationModel.findOneAndUpdate(
          { _id: item.medication, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true },
        );

        if (!med) throw new Error("Недостатньо товару");

        const order = await OrderModel.create({
          user: user._id,
          items,
          total: finalTotal,
          status: "PENDING",
        });

        // Increment promo usage only after the order is committed
        if (promoId) {
          await PromoCodeModel.updateOne(
            { _id: promoId, usedCount: { $lt: promoUsageLimit } },
            { $inc: { usedCount: 1 } },
          );
        }

        logger.info("order.created", {
          user_id: user._id.toString(),
          order_id: order._id.toString(),
          total: finalTotal,
          discount_percent: discountPercent,
        });
        metrics.observeHistogram(
          "http_request_duration_ms",
          Date.now() - startTime,
          { path: "/api/orders" },
        );
        return NextResponse.json(order);
      } catch (error: unknown) {
        let isRetryable = false;
        if (error && typeof error === "object") {
          const errCode = (error as Record<string, unknown>).code;
          const errMsg = (error as Error).message;
          isRetryable =
            errCode === 112 ||
            errMsg?.includes("Write conflict") ||
            errCode === 11000;
        }

        if (isRetryable && retryCount < MAX_RETRIES - 1) {
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 100 * retryCount),
          );
          continue;
        }
        const message = error instanceof Error ? error.message : "Failed";
        logger.error("order.creation_failed", {
          user_id: user._id.toString(),
          error_message: message,
        });
        metrics.observeHistogram(
          "http_request_duration_ms",
          Date.now() - startTime,
          { path: "/api/orders" },
        );
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }

  // Multi-item path with a MongoDB session for atomic stock updates
  while (retryCount < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const item of items) {
        const med = await MedicationModel.findOneAndUpdate(
          { _id: item.medication, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session, new: true },
        );
        if (!med) throw new Error("Недостатньо товару");
      }

      const order = await OrderModel.create(
        [{ user: user._id, items, total: finalTotal, status: "PENDING" }],
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      // Increment promo usage only after the transaction commits
      if (promoId) {
        await PromoCodeModel.updateOne(
          { _id: promoId, usedCount: { $lt: promoUsageLimit } },
          { $inc: { usedCount: 1 } },
        );
      }

      logger.info("order.created", {
        user_id: user._id.toString(),
        order_id: order[0]._id.toString(),
        total: finalTotal,
        discount_percent: discountPercent,
      });
      metrics.observeHistogram(
        "http_request_duration_ms",
        Date.now() - startTime,
        { path: "/api/orders" },
      );
      return NextResponse.json(order[0]);
    } catch (error: unknown) {
      await session.abortTransaction();
      session.endSession();

      let isWriteConflict = false;
      if (error && typeof error === "object") {
        const errCode = (error as Record<string, unknown>).code;
        const errMsg = (error as Error).message;

        interface MongoError extends Error {
          hasErrorLabel?: (label: string) => boolean;
        }
        const mongoErr = error as MongoError;
        const isTransient =
          typeof mongoErr.hasErrorLabel === "function"
            ? mongoErr.hasErrorLabel("TransientTransactionError")
            : false;

        isWriteConflict =
          errCode === 112 || errMsg?.includes("Write conflict") || isTransient;
      }

      if (isWriteConflict && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        const delay = Math.min(
          1000,
          Math.pow(1.5, retryCount) * 20 + Math.random() * 100,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const message = error instanceof Error ? error.message : "Failed";
      logger.error("order.creation_failed", {
        user_id: user._id.toString(),
        error_message: message,
      });
      metrics.observeHistogram(
        "http_request_duration_ms",
        Date.now() - startTime,
        { path: "/api/orders" },
      );
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "System busy" }, { status: 429 });
}

export async function DELETE() {
  const startTime = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "DELETE",
    path: "/api/orders",
  });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram(
      "http_request_duration_ms",
      Date.now() - startTime,
      { path: "/api/orders" },
    );
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }

  await connectDB();
  await OrderModel.deleteMany({ user: user._id });

  metrics.observeHistogram("http_request_duration_ms", Date.now() - startTime, {
    path: "/api/orders",
  });
  return new NextResponse(null, { status: 204 });
}
