import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateSettings, uploadLogo } from "@/lib/actions/settings";
import type { RestaurantSettings } from "@/lib/types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default async function SettingsPage() {
  const { restaurantId } = await requireAdmin();
  const supabase = createClient();
  const { data } = await supabase
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const s = data as RestaurantSettings | null;
  if (!s) return <p>Settings not found.</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-brand-muted">
        Configure your restaurant profile, notification phone, colors, tables,
        and ordering hours.
      </p>

      {/* Logo */}
      <div className="card mt-6 p-4">
        <h2 className="font-semibold">Logo</h2>
        <div className="mt-3 flex items-center gap-4">
          {s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.logo_url}
              alt="Current logo"
              className="h-16 w-16 rounded-xl bg-black/5 object-contain p-1"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-black/5 text-xs text-brand-muted">
              No logo
            </div>
          )}
          <form action={uploadLogo} className="flex items-center gap-2">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
              aria-label="Upload logo"
            />
            <button className="btn-secondary text-sm">Upload logo</button>
          </form>
        </div>
      </div>

      <form action={updateSettings} className="card mt-6 space-y-5 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="display_name">Restaurant name</label>
            <input id="display_name" name="display_name" className="input" defaultValue={s.display_name} />
          </div>
          <div>
            <label className="label" htmlFor="tagline">Tagline</label>
            <input id="tagline" name="tagline" className="input" defaultValue={s.tagline ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="address">Address</label>
            <input id="address" name="address" className="input" defaultValue={s.address ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="instagram">Instagram</label>
            <input id="instagram" name="instagram" className="input" defaultValue={s.instagram ?? ""} />
          </div>
        </div>

        {/* Notification phone */}
        <div className="rounded-xl border border-brand-secondary/40 bg-brand-secondary/5 p-4">
          <label className="label" htmlFor="owner_phone">
            Order notification cell phone
          </label>
          <input
            id="owner_phone"
            name="owner_phone"
            className="input max-w-xs"
            inputMode="tel"
            placeholder="+1 706 555 1234"
            defaultValue={s.owner_phone ?? ""}
          />
          <p className="mt-1 text-xs text-brand-muted">
            This number receives an SMS for every new order. It is never shown to
            customers. Leave blank to disable texts (orders still appear on the
            dashboard).
          </p>
        </div>

        {/* Colors */}
        <div>
          <p className="label">Brand colors</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColorField name="primary_color" label="Primary" value={s.primary_color} />
            <ColorField name="secondary_color" label="Accent" value={s.secondary_color} />
            <ColorField name="bg_color" label="Background" value={s.bg_color} />
            <ColorField name="ink_color" label="Text" value={s.ink_color} />
          </div>
        </div>

        {/* Tables + currency + timezone */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="table_min">Lowest table number</label>
            <input id="table_min" name="table_min" type="number" min={1} className="input" defaultValue={s.table_min} />
          </div>
          <div>
            <label className="label" htmlFor="table_max">Highest table number</label>
            <input id="table_max" name="table_max" type="number" min={1} className="input" defaultValue={s.table_max} />
          </div>
          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <input id="currency" name="currency" className="input" defaultValue={s.currency} />
          </div>
          <div>
            <label className="label" htmlFor="timezone">Timezone</label>
            <select id="timezone" name="timezone" className="input" defaultValue={s.timezone}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ordering hours */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ordering_start">Ordering start (optional)</label>
            <input id="ordering_start" name="ordering_start" type="time" className="input" defaultValue={s.ordering_start ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="ordering_end">Ordering end (optional)</label>
            <input id="ordering_end" name="ordering_end" type="time" className="input" defaultValue={s.ordering_end ?? ""} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-brand-muted">
          Leave both blank to accept orders any time. Overnight ranges (e.g.
          5:00 PM–2:00 AM) are supported.
        </p>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="ordering_enabled" defaultChecked={s.ordering_enabled} />
            Accept online orders
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="sound_alerts" defaultChecked={s.sound_alerts} />
            Play a sound for new orders
          </label>
        </div>

        <div>
          <label className="label" htmlFor="order_disclaimer">Order disclaimer</label>
          <textarea id="order_disclaimer" name="order_disclaimer" rows={2} className="input py-3" defaultValue={s.order_disclaimer} />
        </div>

        <button className="btn-primary">Save settings</button>
      </form>
    </div>
  );
}

function ColorField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="color"
          defaultValue={value}
          className="h-11 w-12 cursor-pointer rounded-lg border border-black/15"
          aria-label={`${label} color`}
        />
        <span className="text-xs text-brand-muted">{value}</span>
      </div>
    </div>
  );
}
