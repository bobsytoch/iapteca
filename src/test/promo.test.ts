import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { POST as promoApplyPost } from '@/app/api/promos/apply/route';
import { GET as adminGetPromos, POST as adminCreatePromo } from '@/app/api/admin/promos/route';
import { DELETE as adminDeletePromo } from '@/app/api/admin/promos/[id]/route';
import { POST as ordersPost } from '@/app/api/orders/route';
import { PromoCodeModel, MedicationModel, OrderModel } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn(),
  PromoCodeModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
  MedicationModel: {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
  OrderModel: {
    create: vi.fn(),
  },
}));

vi.mock('mongoose', () => {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
  };
  return {
    default: { startSession: vi.fn().mockResolvedValue(session) },
    Schema: vi.fn(),
    model: vi.fn(),
    models: {},
  };
});

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date('2020-01-01');

const validPromo = {
  _id: { toString: () => 'promo_id_1' },
  code: 'SAVE10',
  discountPercent: 10,
  expiresAt: FUTURE,
  usageLimit: 5,
  usedCount: 2,
};

const customerUser = { _id: 'user1', role: 'CUSTOMER' };
const adminUser = { _id: 'admin1', role: 'ADMIN' };

// ─── 1. Pure discount calculation ─────────────────────────────────────────────

describe('Discount calculation logic', () => {
  it('applies X% correctly', () => {
    const rawTotal = 1000;
    const discountPercent = 10;
    const final = parseFloat(
      Math.max(rawTotal - (rawTotal * discountPercent) / 100, 0).toFixed(2)
    );
    expect(final).toBe(900);
  });

  it('100% discount yields 0', () => {
    const rawTotal = 500;
    const final = Math.max(rawTotal - (rawTotal * 100) / 100, 0);
    expect(final).toBe(0);
  });

  it('0% discount leaves total unchanged', () => {
    const rawTotal = 1000;
    const final = Math.max(rawTotal - (rawTotal * 0) / 100, 0);
    expect(final).toBe(1000);
  });

  it('discount never makes total negative', () => {
    const rawTotal = 100;
    const final = Math.max(rawTotal - 200, 0);
    expect(final).toBe(0);
  });

  it('floating-point result is rounded to 2 decimal places', () => {
    const rawTotal = 99.99;
    const discountPercent = 10;
    const final = parseFloat(
      Math.max(rawTotal - (rawTotal * discountPercent) / 100, 0).toFixed(2)
    );
    expect(final).toBe(89.99);
  });
});

// ─── 2. POST /api/promos/apply ────────────────────────────────────────────────

describe('POST /api/promos/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthUser as Mock).mockResolvedValue(customerUser);
  });

  it('returns 401 when unauthenticated', async () => {
    (getAuthUser as Mock).mockResolvedValue(null);
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no code is provided', async () => {
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown code', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'UNKNOWN' }),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 for expired code', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...validPromo, expiresAt: PAST }),
    });
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/закінчився/i);
  });

  it('returns 400 for exhausted code', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...validPromo, usedCount: 5, usageLimit: 5 }),
    });
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/вичерпано/i);
  });

  it('returns discountPercent for a valid code', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue(validPromo),
    });
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    const res = await promoApplyPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discountPercent).toBe(10);
  });

  it('does NOT increment usedCount (validation only)', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue(validPromo),
    });
    const req = new Request('http://localhost/api/promos/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    await promoApplyPost(req);
    expect(PromoCodeModel.updateOne).not.toHaveBeenCalled();
  });
});

// ─── 3. POST /api/orders – discount applied to total ─────────────────────────

describe('POST /api/orders – promo discount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthUser as Mock).mockResolvedValue(customerUser);
    // Medication price = 1000
    (MedicationModel.findById as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'med1', price: 1000, stock: 10 }),
    });
    (MedicationModel.findOneAndUpdate as Mock).mockResolvedValue({ _id: 'med1', stock: 9 });
    (PromoCodeModel.updateOne as Mock).mockResolvedValue({ modifiedCount: 1 });
  });

  it('creates order with full price when no promo is given', async () => {
    (OrderModel.create as Mock).mockResolvedValue({ _id: 'order1', total: 1000 });
    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ medication: 'med1', quantity: 1, price: 1000 }] }),
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(200);
    expect(OrderModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1000 })
    );
  });

  it('creates order with discounted total when a valid promo is given', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue(validPromo),
    });
    (OrderModel.create as Mock).mockResolvedValue({ _id: 'order1', total: 900 });

    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ medication: 'med1', quantity: 1, price: 1000 }],
        promoCode: 'SAVE10',
      }),
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(200);
    // 1000 - 10% = 900
    expect(OrderModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 900 })
    );
  });

  it('increments promo usedCount after successful order', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue(validPromo),
    });
    (OrderModel.create as Mock).mockResolvedValue({ _id: 'order1', total: 900 });

    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ medication: 'med1', quantity: 1, price: 1000 }],
        promoCode: 'SAVE10',
      }),
    });
    await ordersPost(req);
    expect(PromoCodeModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'promo_id_1' }),
      { $inc: { usedCount: 1 } }
    );
  });

  it('does not increment promo when order creation fails', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue(validPromo),
    });
    // Simulate out-of-stock
    (MedicationModel.findOneAndUpdate as Mock).mockResolvedValue(null);

    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ medication: 'med1', quantity: 1, price: 1000 }],
        promoCode: 'SAVE10',
      }),
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(400);
    expect(PromoCodeModel.updateOne).not.toHaveBeenCalled();
  });

  it('ignores invalid/expired promo and uses full price', async () => {
    (PromoCodeModel.findOne as Mock).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...validPromo, expiresAt: PAST }),
    });
    (OrderModel.create as Mock).mockResolvedValue({ _id: 'order1', total: 1000 });

    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ medication: 'med1', quantity: 1, price: 1000 }],
        promoCode: 'SAVE10',
      }),
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(200);
    expect(OrderModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1000 })
    );
    expect(PromoCodeModel.updateOne).not.toHaveBeenCalled();
  });
});

// ─── 4. Admin promo endpoints ─────────────────────────────────────────────────

describe('Admin promo endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthUser as Mock).mockResolvedValue(adminUser);
  });

  it('GET /api/admin/promos – returns 401 for non-admin', async () => {
    (getAuthUser as Mock).mockResolvedValue(customerUser);
    const res = await adminGetPromos();
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/promos – returns list for admin', async () => {
    (PromoCodeModel.find as Mock).mockReturnValue({ lean: vi.fn().mockResolvedValue([validPromo]) });
    const res = await adminGetPromos();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST /api/admin/promos – returns 400 for missing fields', async () => {
    const req = new Request('http://localhost/api/admin/promos', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }), // missing discountPercent etc.
    });
    const res = await adminCreatePromo(req);
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/promos – creates a promo successfully', async () => {
    (PromoCodeModel.create as Mock).mockResolvedValue({
      _id: 'new_promo',
      code: 'SUMMER20',
      discountPercent: 20,
      expiresAt: FUTURE,
      usageLimit: 100,
      usedCount: 0,
    });
    const req = new Request('http://localhost/api/admin/promos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUMMER20',
        discountPercent: 20,
        expiresAt: FUTURE.toISOString(),
        usageLimit: 100,
      }),
    });
    const res = await adminCreatePromo(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.code).toBe('SUMMER20');
  });

  it('DELETE /api/admin/promos/[id] – returns 404 when not found', async () => {
    (PromoCodeModel.findByIdAndDelete as Mock).mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/promos/nonexistent');
    const res = await adminDeletePromo(req, {
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/admin/promos/[id] – deletes successfully', async () => {
    (PromoCodeModel.findByIdAndDelete as Mock).mockResolvedValue(validPromo);
    const req = new Request('http://localhost/api/admin/promos/promo_id_1');
    const res = await adminDeletePromo(req, {
      params: Promise.resolve({ id: 'promo_id_1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
