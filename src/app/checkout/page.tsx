"use client";

import { useState } from "react";
import { useCartStore } from "@/lib/store/cartStore";
import { useAuthStore } from "@/lib/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, Tag, X } from "lucide-react";

interface AppliedPromo {
  code: string;
  discountPercent: number;
}

export default function CheckoutPage() {
  const { items, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const router = useRouter();

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);

  const rawTotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const discountAmount = appliedPromo
    ? parseFloat(((rawTotal * appliedPromo.discountPercent) / 100).toFixed(2))
    : 0;
  const finalTotal = parseFloat((rawTotal - discountAmount).toFixed(2));

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    if (!user) return router.push("/login");

    setIsApplying(true);
    try {
      const res = await fetch("/api/promos/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoInput.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        setAppliedPromo({
          code: promoInput.trim().toUpperCase(),
          discountPercent: data.discountPercent,
        });
        toast.success(`Промокод застосовано: -${data.discountPercent}%`);
      } else {
        toast.error(data.error || "Невірний промокод");
      }
    } catch {
      toast.error("Мережева помилка");
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput("");
  };

  const handleOrder = async () => {
    if (!user) return router.push("/login");

    setIsOrdering(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            medication: i._id,
            quantity: i.quantity,
            price: i.price,
          })),
          promoCode: appliedPromo?.code ?? undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Замовлення успішно створено");
        clearCart();
        router.push("/profile");
      } else {
        toast.error(data.error || "Помилка при створенні замовлення");
      }
    } catch {
      toast.error("Сталася мережева помилка");
    } finally {
      setIsOrdering(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-20 text-center opacity-50 font-sans">
        Кошик порожній
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-lg space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <CreditCard className="w-6 h-6" /> Оформлення замовлення
      </h1>

      {/* Cart items */}
      <div className="border rounded-xl p-6 space-y-4 shadow-sm bg-card">
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i._id} className="flex justify-between text-sm">
              <span className="opacity-80">
                {i.name} x{i.quantity}
              </span>
              <span className="font-medium">
                {(i.price * i.quantity).toFixed(2)} ₴
              </span>
            </div>
          ))}
        </div>

        <div className="border-t pt-4 space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Сума без знижки:</span>
            <span className={appliedPromo ? "line-through" : ""}>
              {rawTotal.toFixed(2)} ₴
            </span>
          </div>
          {appliedPromo && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Знижка ({appliedPromo.discountPercent}%):</span>
              <span>-{discountAmount.toFixed(2)} ₴</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-1">
            <span>Разом:</span>
            <span className="text-primary">{finalTotal.toFixed(2)} ₴</span>
          </div>
        </div>
      </div>

      {/* Promo code section */}
      <div className="border rounded-xl p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Tag className="w-4 h-4" />
          <span>Промокод</span>
        </div>

        {appliedPromo ? (
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
            <span className="text-green-700 dark:text-green-400 font-mono font-medium text-sm">
              {appliedPromo.code} &mdash; -{appliedPromo.discountPercent}%
            </span>
            <button
              onClick={handleRemovePromo}
              className="text-green-600 dark:text-green-400 hover:text-red-500 ml-2"
              aria-label="Видалити промокод"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Введіть промокод"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
              className="font-mono uppercase"
            />
            <Button
              variant="outline"
              onClick={handleApplyPromo}
              disabled={isApplying || !promoInput.trim()}
            >
              {isApplying ? "Перевірка…" : "Застосувати"}
            </Button>
          </div>
        )}
      </div>

      {/* Place order */}
      <Button
        className="w-full h-12 text-lg font-bold shadow-lg"
        onClick={handleOrder}
        disabled={isOrdering}
      >
        <CheckCircle2 className="w-5 h-5 mr-2" />
        {isOrdering ? "Обробка…" : "Підтвердити замовлення"}
      </Button>
    </div>
  );
}
