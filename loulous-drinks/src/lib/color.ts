// Convert a hex color (#rrggbb or #rgb) into "r g b" channels for CSS variables.
export function hexToRgbChannels(hex: string, fallback = "28 28 28"): string {
  if (!hex) return fallback;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// Choose black or white text for good contrast against a hex background.
export function readableTextOn(hex: string): string {
  const channels = hexToRgbChannels(hex, "255 255 255")
    .split(" ")
    .map(Number);
  const [r, g, b] = channels;
  // Relative luminance (sRGB approximation)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c1c1c" : "#ffffff";
}
