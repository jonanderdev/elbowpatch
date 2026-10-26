#!/usr/bin/env node
// WCAG 2.x contrast for colour pairs.
//   node contrast.mjs "#2c2824 on #f6f1e7" "#b0563a on #f6f1e7:mark"
// Suffix :large or :mark checks against 3:1 instead of 4.5:1.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
let failed = false;
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^(#[0-9a-f]{6})\s+on\s+(#[0-9a-f]{6})(?::(large|mark))?$/i);
  if (!m) {
    console.error(`skip: ${arg}`);
    continue;
  }
  const [a, b] = [lum(m[1]), lum(m[2])];
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const need = m[3] ? 3 : 4.5;
  const verdict = ratio >= 7 && !m[3] ? "AAA" : ratio >= need ? "AA" : "FAIL";
  if (verdict === "FAIL") failed = true;
  console.log(
    `${m[1]} on ${m[2]}  ${ratio.toFixed(2)}:1  ${verdict}${m[3] ? ` (${m[3]}, needs 3:1)` : ""}`,
  );
}
process.exit(failed ? 1 : 0);
