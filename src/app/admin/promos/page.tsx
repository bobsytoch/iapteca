"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { toast } from "sonner";

interface Promo {
  _id: string;
  code: string;
  discountPercent: number;
  expiresAt: string;
  usageLimit: number;
  usedCount: number;
}

export default function PromoAdminPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [expires, setExpires] = useState("");
  const [limit, setLimit] = useState("");

  const fetchPromos = () =>
    fetch("/api/admin/promos")
      .then((res) => res.json())
      .then((data: Promo[] | { error: string }) => {
        if (Array.isArray(data)) setPromos(data);
        else toast.error(data.error || "Не вдалося отримати промокоди");
      });

  useEffect(() => {
    fetchPromos();
  }, []);

  const handleCreate = async () => {
    const payload = {
      code,
      discountPercent: Number(discount),
      expiresAt: expires,
      usageLimit: Number(limit),
    };
    const res = await fetch("/api/admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Промокод створено");
      setCode("");
      setDiscount("");
      setExpires("");
      setLimit("");
      fetchPromos();
    } else {
      toast.error(data.error || "Не вдалося створити промокод");
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/promos/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      toast.success("Промокод видалено");
      fetchPromos();
    } else {
      toast.error(data.error || "Не вдалося видалити");
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Керування промокодами</h1>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Створити новий промокод</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            placeholder="Код (наприклад, SUMMER10)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            placeholder="Знижка у %"
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <Input
            placeholder="Термін дії (YYYY-MM-DD)"
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
          <Input
            placeholder="Ліміт використань"
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreate}>Створити</Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        {promos.map((p) => (
          <Card key={p._id}>
            <CardContent className="flex justify-between items-center py-4">
              <div>
                <div className="font-medium">{p.code}</div>
                <div className="text-sm text-muted-foreground">
                  {p.discountPercent}% – до{" "}
                  {new Date(p.expiresAt).toLocaleDateString()}
                </div>
                <div className="text-sm">
                  Використано: {p.usedCount}/{p.usageLimit}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(p._id)}
              >
                Видалити
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
