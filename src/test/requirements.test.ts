import { vi, describe, it, expect, beforeEach, Mock } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  GET as medicationsGet,
  POST as medicationsPost,
} from "@/app/api/medications/route";
import { POST as ordersPost } from "@/app/api/orders/route";
import { PATCH as orderPatch } from "@/app/api/orders/[id]/route";
import { UserModel, MedicationModel, OrderModel } from "@/lib/db";
import bcrypt from "bcrypt";
import { getAuthUser } from "@/lib/auth";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
  UserModel: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  MedicationModel: {
    find: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
  },
  OrderModel: {
    find: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("mongoose", () => {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
  };
  return {
    default: {
      startSession: vi.fn().mockResolvedValue(session),
    },
    Schema: vi.fn(),
    model: vi.fn(),
    models: {},
  };
});

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password_bcrypt"),
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(),
  setAuthCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe("iApteca Requirements Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Тест 1: Пошук повертає результати і виконується < 200 мс", async () => {
    const mockMedications = [{ name: "Анальгін" }, { name: "Анаферон" }];
    const mockLean = vi.fn().mockResolvedValue(mockMedications);
    const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
    const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
    (MedicationModel.find as Mock).mockReturnValue({ skip: mockSkip });

    const start = performance.now();
    const req = new Request("http://localhost/api/medications?search=Ана");
    const res = await medicationsGet(req);
    const end = performance.now();
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data[0].name).toContain("Анал");
    expect(data[1].name).toContain("Анаф");
    expect(end - start).toBeLessThan(200);
  });

  it("Тест 2: Паролі зберігаються у вигляді хешу bcrypt", async () => {
    (UserModel.findOne as Mock).mockResolvedValue(null);
    (UserModel.create as Mock).mockResolvedValue({
      _id: "user123",
      role: "CUSTOMER",
    });

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        phone: "+380630000000",
        password: "SuperSecret123",
        name: "John",
      }),
    });

    await registerPost(req);

    expect(bcrypt.hash).toHaveBeenCalledWith("SuperSecret123", 10);
    expect(UserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: "hashed_password_bcrypt",
      }),
    );
  });

  it("Тест 3: Замовлення створюється зі статусом PENDING", async () => {
    (getAuthUser as Mock).mockResolvedValue({
      _id: "user123",
      role: "CUSTOMER",
    });

    // findById is now called first to compute server-side total
    (MedicationModel.findById as Mock)
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ _id: "med1", price: 100, stock: 10 }),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ _id: "med2", price: 200, stock: 10 }),
      });
    (MedicationModel.findOneAndUpdate as Mock).mockResolvedValue({
      _id: "med1",
      name: "Товар 1",
      stock: 10,
    });
    const orderData = {
      items: [
        { medication: "med1", quantity: 1, price: 100 },
        { medication: "med2", quantity: 1, price: 200 },
      ],
      total: 300,
    };

    (OrderModel.create as Mock).mockResolvedValue([{ _id: "order_unique_id" }]);

    const req = new Request("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify(orderData),
    });

    const res = await ordersPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(OrderModel.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: "PENDING",
          items: expect.arrayContaining([
            expect.objectContaining({ medication: "med1" }),
            expect.objectContaining({ medication: "med2" }),
          ]),
        }),
      ]),
      expect.anything(),
    );
    expect(data._id).toBe("order_unique_id");
  });

  it("Тест 4: Сток повертається при скасуванні замовлення", async () => {
    (getAuthUser as Mock).mockResolvedValue({ _id: "admin123", role: "ADMIN" });
    const mockOrder = {
      _id: "order123",
      status: "PENDING",
      items: [{ medication: "citramon_id", quantity: 5 }],
    };
    (OrderModel.findById as Mock).mockReturnValue({
      session: vi.fn().mockResolvedValue(mockOrder),
    });
    const mockMedUpdate = { session: vi.fn().mockResolvedValue({}) };
    (MedicationModel.findByIdAndUpdate as Mock).mockReturnValue(mockMedUpdate);

    const req = new Request("http://localhost/api/orders/order123", {
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" }),
    });

    await orderPatch(req, { params: Promise.resolve({ id: "order123" }) });

    expect(MedicationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "citramon_id",
      { $inc: { stock: 5 } },
    );
  });

  it("Тест 5: Користувач CUSTOMER не може створювати препарати", async () => {
    (getAuthUser as Mock).mockResolvedValue({
      _id: "user123",
      role: "CUSTOMER",
    });

    const req = new Request("http://localhost/api/medications", {
      method: "POST",
      body: JSON.stringify({ name: "Новий препарат" }),
    });

    const res = await medicationsPost(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });
});
