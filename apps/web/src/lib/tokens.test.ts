// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The design tokens promise AA contrast (4.5:1) for text on its background.
 * This reads the pairs straight out of globals.css so the promise cannot
 * silently drift when a colour is tuned.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}

const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("@media"));
const darkBlock = css.slice(css.indexOf("@media"), css.indexOf("@theme"));
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: [text: string, background: string][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["muted", "background"],
  ["muted", "surface"],
  ["link", "background"],
  ["accent-fg", "accent"],
  ["fit-ok", "fit-ok-bg"],
  ["fit-ask", "fit-ask-bg"],
  ["fit-no", "fit-no-bg"],
  ["fit-ok", "background"],
  ["fit-ask", "background"],
  ["fit-no", "background"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme tokens", (_theme, palette) => {
  it.each(PAIRS)("%s on %s reaches 4.5:1", (text, background) => {
    const fg = palette[text];
    const bg = palette[background];
    expect(fg, `token --${text} missing`).toBeDefined();
    expect(bg, `token --${background} missing`).toBeDefined();
    expect(contrast(fg ?? "", bg ?? "")).toBeGreaterThanOrEqual(4.5);
  });
});
