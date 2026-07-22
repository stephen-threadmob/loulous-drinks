import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";

// Protected admin shell. requireAdmin() redirects unauthenticated users and
// those with no linked restaurant. The middleware also guards /admin/* as a
// first line of defense.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { restaurant } = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-brand-bg">
      <AdminNav restaurantName={restaurant.name} />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
