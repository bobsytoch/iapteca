import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (user?.role !== "ADMIN") redirect("/");

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <aside className="w-full md:w-64 border-r bg-muted/20 p-4 space-y-2">
        <h2 className="font-bold mb-4">Адмін-панель</h2>
        <nav className="flex flex-col gap-1">
          <Link href="/admin" className="p-2 hover:bg-muted rounded">
            Статистика
          </Link>
          <Link
            href="/admin/medications"
            className="p-2 hover:bg-muted rounded"
          >
            Препарати
          </Link>
          <Link href="/admin/categories" className="p-2 hover:bg-muted rounded">
            Категорії
          </Link>
          <Link href="/admin/orders" className="p-2 hover:bg-muted rounded">
            Замовлення
          </Link>
          <Link href="/admin/users" className="p-2 hover:bg-muted rounded">
            Користувачі
          </Link>
          <Link href="/admin/promos" className="p-2 hover:bg-muted rounded">
            Промокоди
          </Link>
          <Link href="/" className="p-2 hover:bg-muted rounded text-blue-600">
            На сайт
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
