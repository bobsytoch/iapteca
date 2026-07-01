import { connectDB, MedicationModel, OrderModel, UserModel } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await connectDB();
  const [meds, orders, users] = await Promise.all([
    MedicationModel.countDocuments({ isDeleted: { $ne: true } }),
    OrderModel.countDocuments(),
    UserModel.countDocuments(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Статистика</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg bg-card">
          <div>Препарати</div>
          <div className="text-2xl font-bold">{meds}</div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div>Замовлення</div>
          <div className="text-2xl font-bold">{orders}</div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div>Користувачі</div>
          <div className="text-2xl font-bold">{users}</div>
        </div>
      </div>
    </div>
  );
}
