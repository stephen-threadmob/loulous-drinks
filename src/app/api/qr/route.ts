import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";

// GET /api/qr?slug=lou-lous-fosters&format=png|svg&download=1
// Generates a QR code that points at the restaurant's permanent menu URL.
// The URL never changes when the menu is edited, so printed codes stay valid.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") || publicEnv.defaultRestaurantSlug)
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 120);
  const format = searchParams.get("format") === "svg" ? "svg" : "png";
  const download = searchParams.get("download") === "1";

  const target = `${publicEnv.siteUrl.replace(/\/$/, "")}/${slug}`;

  const options = {
    errorCorrectionLevel: "M" as const,
    margin: 2,
    width: 1024,
    color: { dark: "#1c1c1c", light: "#ffffff" },
  };

  try {
    if (format === "svg") {
      const svg = await QRCode.toString(target, { ...options, type: "svg" });
      return new NextResponse(svg, {
        headers: {
          "content-type": "image/svg+xml",
          ...(download && {
            "content-disposition": `attachment; filename="${slug}-menu-qr.svg"`,
          }),
          "cache-control": "public, max-age=3600",
        },
      });
    }
    const buffer = await QRCode.toBuffer(target, { ...options, type: "png" });
    return new NextResponse(buffer, {
      headers: {
        "content-type": "image/png",
        ...(download && {
          "content-disposition": `attachment; filename="${slug}-menu-qr.png"`,
        }),
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate the QR code." },
      { status: 500 }
    );
  }
}
