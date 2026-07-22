"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/admin/actions";

const LINKS = [
  { href: "/admin/dashboard", label: "Orders", icon: "🧾" },
  { href: "/admin/menu", label: "Menu", icon: "🍸" },
  { href: "/admin/upload", label: "Upload menu", icon: "⬆️" },
  { href: "/admin/qr", label: "QR code", icon: "🔳" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export function AdminNav({ restaurantName }: { restaurantName: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/10 bg-white md:flex">
        <div className="px-5 py-5">
          <p className="font-display text-lg font-bold leading-tight">
            {restaurantName}
          </p>
          <p className="text-xs text-brand-muted">Admin</p>
        </div>
        <nav className="flex-1 px-2">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active
                    ? "bg-brand-primary text-white"
                    : "text-brand-ink hover:bg-black/5"
                }`}
              >
                <span aria-hidden>{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <form action={signOut} className="p-3">
          <button className="btn-ghost w-full text-sm">Sign out</button>
        </form>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-black/10 bg-white md:hidden">
        {LINKS.map((l) => {
          const active =
            pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? "text-brand-primary" : "text-brand-muted"
              }`}
            >
              <span aria-hidden className="text-lg">
                {l.icon}
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
