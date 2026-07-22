import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Shown when a user is authenticated but not linked to any restaurant in
// admin_users. Points the operator to the DEPLOYMENT step that links them.
export default async function NoAccessPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="font-display text-2xl font-bold">No restaurant linked</h1>
        <p className="mt-3 text-brand-muted">
          You&apos;re signed in{user?.email ? ` as ${user.email}` : ""}, but this
          account isn&apos;t linked to a restaurant yet. An owner needs to add a
          row to <code className="rounded bg-black/5 px-1">admin_users</code>{" "}
          linking your user to the restaurant (see DEPLOYMENT.md, step 4).
        </p>
        <Link href="/admin/login" className="btn-ghost mt-6">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
