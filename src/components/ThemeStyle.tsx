import { hexToRgbChannels } from "@/lib/color";

// Injects per-restaurant brand colors as CSS variables. Rendered near the top
// of a page's tree so the whole subtree themes to the restaurant's colors
// without a rebuild. Server component (no client JS needed).
export function ThemeStyle({
  primary,
  secondary,
  bg,
  ink,
}: {
  primary: string;
  secondary: string;
  bg: string;
  ink: string;
}) {
  const css = `:root{
    --brand-primary:${hexToRgbChannels(primary, "28 28 28")};
    --brand-secondary:${hexToRgbChannels(secondary, "176 141 87")};
    --brand-bg:${hexToRgbChannels(bg, "244 239 228")};
    --brand-ink:${hexToRgbChannels(ink, "28 28 28")};
  }`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
