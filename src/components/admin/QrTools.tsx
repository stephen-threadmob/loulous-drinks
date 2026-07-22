"use client";

// Client controls for the QR page: download links + a print button. Kept as a
// client component so the print button can call window.print().
export function QrPrintButton() {
  return (
    <button className="btn-primary no-print" onClick={() => window.print()}>
      Print poster
    </button>
  );
}
