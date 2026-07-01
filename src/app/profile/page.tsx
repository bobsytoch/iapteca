import { getAuthUser } from "@/lib/auth";
import { connectDB, OrderModel } from "@/lib/db";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/lib/types";
import { statusMap } from "@/lib/utils";
import { Package } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  await connectDB();
  const orders = (await OrderModel.find({ user: user._id })
    .sort({ createdAt: -1 })
    .lean()) as unknown as Order[];

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Профіль: {user.phone}</h1>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Package className="w-5 h-5" /> Мої замовлення
        </h2>
        {orders.length === 0 ? (
          <p className="opacity-50">У вас ще немає замовлень</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {orders.map((o) => {
              const status = statusMap[o.status] || {
                label: o.status,
                variant: "outline",
              };
              return (
                <div
                  key={o._id.toString()}
                  className="p-4 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">
                      Замовлення #{o._id.toString().slice(-6)}
                    </div>
                    <div className="text-sm opacity-70">
                      {new Date(o.createdAt).toLocaleDateString()} — {o.total} ₴
                    </div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
