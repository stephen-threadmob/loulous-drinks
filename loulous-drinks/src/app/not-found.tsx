import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-bg px-6 text-center">
      <p className="font-display text-5xl font-bold">Not found</p>
      <p className="mt-3 text-brand-muted">
        We couldn&apos;t find that page. If you scanned a QR code, please ask a
        server for help.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Go to the menu
      </Link>
    </main>
  );
}
