// Contrast gate for the three themes, read straight from app/globals.css. Fails the build if any pair is below
// WCAG: 4.5:1 for body text (and amber button text), 3:1 for 11px mono labels and semantic colours on panels.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Tokens = Record<string, string>;

export function themeTokens(css: string): Record<string, Tokens> {
  const blocks: Record<string, string> = {
    console: /:root,\s*\[data-theme="console"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "",
    dim: /\[data-theme="dim"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "",
    paper: /\[data-theme="paper"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "",
  };
  const out: Record<string, Tokens> = {};
  for (const [name, body] of Object.entries(blocks)) {
    out[name] = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  }
  return out;
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** [foreground, background, minimum] */
export const PAIRS: [string, string, number][] = [
  ["fg", "bg", 4.5], ["fg", "panel", 4.5], ["fg", "panel-2", 4.5],
  ["fg-dim", "bg", 4.5], ["fg-dim", "panel", 4.5], ["fg-dim", "panel-2", 4.5],
  ["amber-ink", "amber", 4.5],
  ["fg-faint", "bg", 3], ["fg-faint", "panel", 3],
  ["amber", "bg", 3], ["amber", "panel", 3],
  ["ok", "panel", 3], ["warn", "panel", 3], ["crit", "panel", 3], ["info", "panel", 3],
];

export function checkContrast(css: string): string[] {
  const failures: string[] = [];
  for (const [theme, t] of Object.entries(themeTokens(css))) {
    for (const [fg, bg, min] of PAIRS) {
      if (!t[fg] || !t[bg]) {
        failures.push(`${theme}: missing --${!t[fg] ? fg : bg}`);
        continue;
      }
      const r = ratio(t[fg], t[bg]);
      if (r < min) failures.push(`${theme}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${r.toFixed(2)}:1 (needs ${min}:1)`);
    }
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const failures = checkContrast(css);
  if (failures.length) {
    console.error(`Contrast check failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Contrast check passed: ${PAIRS.length} pairs x 3 themes.`);
}
