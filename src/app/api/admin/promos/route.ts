import { NextResponse } from "next/server";
import { connectDB, PromoCodeModel } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";

export async function GET() {
  const start = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "GET",
    path: "/api/admin/promos",
  });

  const user = await getAuthUser();
  if (!user || user.role !== "ADMIN") {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/admin/promos",
    });
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }

  await connectDB();
  const promos = await PromoCodeModel.find().lean();
  metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
    path: "/api/admin/promos",
  });
  return NextResponse.json(promos);
}

export async function POST(req: Request) {
  const start = Date.now();
  metrics.incrementCounter("http_requests_total", {
    method: "POST",
    path: "/api/admin/promos",
  });

  const user = await getAuthUser();
  if (!user || user.role !== "ADMIN") {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/admin/promos",
    });
    return NextResponse.json({ error: "Auth" }, { status: 401 });
  }

  const { code, discountPercent, expiresAt, usageLimit } = await req.json();
  if (!code || discountPercent == null || !expiresAt || usageLimit == null) {
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/admin/promos",
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await connectDB();
  try {
    const promo = await PromoCodeModel.create({
      code: (code as string).toUpperCase().trim(),
      discountPercent: Number(discountPercent),
      expiresAt: new Date(expiresAt),
      usageLimit: Number(usageLimit),
      usedCount: 0,
    });
    logger.info("promo.created", { adminId: user._id, code });
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/admin/promos",
    });
    return NextResponse.json(promo, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    metrics.observeHistogram("http_request_duration_ms", Date.now() - start, {
      path: "/api/admin/promos",
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
