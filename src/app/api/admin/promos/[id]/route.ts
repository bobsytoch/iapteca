import { NextResponse } from 'next/server';
import { connectDB, PromoCodeModel } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'DELETE', path: '/api/admin/promos/[id]' });

  const user = await getAuthUser();
  if (!user || user.role !== 'ADMIN') {
    metrics.observeHistogram('http_request_duration_ms', Date.now() - start, { path: '/api/admin/promos/[id]' });
    return NextResponse.json({ error: 'Auth' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const deleted = await PromoCodeModel.findByIdAndDelete(id);
  if (!deleted) {
    metrics.observeHistogram('http_request_duration_ms', Date.now() - start, { path: '/api/admin/promos/[id]' });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  logger.info('promo.deleted', { adminId: user._id, promoId: id });
  metrics.observeHistogram('http_request_duration_ms', Date.now() - start, { path: '/api/admin/promos/[id]' });
  return NextResponse.json({ ok: true });
}
