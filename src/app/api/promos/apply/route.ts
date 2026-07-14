import { NextResponse } from "next/server";
import { connectDB, PromoCodeModel } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { metrics } from "@/lib/metrics";

// Validates a promo code and returns its discount percentage.
// Does NOT increment usage – that happens only when the order is created.
export async function POST(req: Request) {
  const start = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "POST",
    path: "/api/promos/apply",
  });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/promos/apply",
    });
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }

  const { code } = await req.json();
  if (!code) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/promos/apply",
    });
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  await connectDB();

  const promo = await PromoCodeModel.findOne({
    code: (code as string).toUpperCase().trim(),
  }).lean();
  if (!promo) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/promos/apply",
    });
    return NextResponse.json(
      { error: "Промокод не знайдено" },
      { status: 404 },
    );
  }

  if (new Date(promo.expiresAt) < new Date()) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/promos/apply",
    });
    return NextResponse.json({ error: "Промокод закінчився" }, { status: 400 });
  }

  if (promo.usedCount >= promo.usageLimit) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/promos/apply",
    });
    return NextResponse.json({ error: "Промокод вичерпано" }, { status: 400 });
  }

  metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
    path: "/api/promos/apply",
  });
  return NextResponse.json({
    discountPercent: promo.discountPercent,
    expiresAt: promo.expiresAt,
  });
}
