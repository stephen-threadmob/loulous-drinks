import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { QrPrintButton } from "@/components/admin/QrTools";

export const dynamic = "force-dynamic";

export default async function QrPage() {
  const { restaurant, restaurantId } = await requireAdmin();
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("display_name, logo_url, address")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const slug = restaurant.slug;
  const menuUrl = `${publicEnv.siteUrl.replace(/\/$/, "")}/${slug}`;
  const pngUrl = `/api/qr?slug=${slug}&format=png`;
  const svgUrl = `/api/qr?slug=${slug}&format=svg`;
  const name = settings?.display_name ?? restaurant.name;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold no-print">Table QR code</h1>
      <p className="mt-1 text-brand-muted no-print">
        Guests scan this to open your live menu. The link is permanent — updating
        your menu never requires reprinting the code.
      </p>

      <div className="card mt-4 p-4 no-print">
        <p className="text-sm text-brand-muted">Menu link</p>
        <p className="break-all font-mono text-sm">{menuUrl}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className="btn-secondary text-sm" href={`${pngUrl}&download=1`}>
            Download PNG
          </a>
          <a className="btn-ghost text-sm" href={`${svgUrl}&download=1`}>
            Download SVG
          </a>
          <QrPrintButton />
        </div>
      </div>

      {/* Printable poster */}
      <div className="mt-6 flex justify-center">
        <div
          id="qr-poster"
          className="w-[420px] rounded-3xl border border-black/10 bg-white p-8 text-center shadow-card"
        >
          {settings?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo_url}
              alt={`${name} logo`}
              className="mx-auto mb-3 h-16 w-auto object-contain"
            />
          ) : (
            <p className="font-display text-2xl font-bold">{name}</p>
          )}
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
            Scan to Order Drinks
          </h2>
          <p className="mt-2 text-brand-muted">
            Point your phone camera at the code, then order right from your table.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pngUrl}
            alt={`QR code linking to ${name} drink menu`}
            className="mx-auto mt-5 h-64 w-64"
          />
          <p className="mt-5 text-sm font-medium">{name}</p>
          {settings?.address && (
            <p className="text-xs text-brand-muted">{settings.address}</p>
          )}
        </div>
      </div>
    </div>
  );
}
