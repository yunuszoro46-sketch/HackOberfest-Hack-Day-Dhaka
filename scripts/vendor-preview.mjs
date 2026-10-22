// Copies the pinned browser builds that previews may load into public/preview-vendor/.
// Run once after changing a version: node scripts/vendor-preview.mjs (needs npm and network).
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const VENDOR = [
  { pkg: "react@18.3.1", from: "package/umd/react.production.min.js", to: "react.js" },
  { pkg: "react-dom@18.3.1", from: "package/umd/react-dom.production.min.js", to: "react-dom.js" },
  { pkg: "htm@3.1.1", from: "package/dist/htm.umd.js", to: "htm.js" },
  { pkg: "@tailwindcss/browser@4.3.3", from: "package/dist/index.global.js", to: "tailwind.js" },
];

const out = join(process.cwd(), "public", "preview-vendor");
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "tm-vendor-"));
try {
  for (const v of VENDOR) {
    const tgz = execFileSync("npm", ["pack", v.pkg, "--silent", "--pack-destination", work], { encoding: "utf8" }).trim().split("\n").at(-1);
    const dir = join(work, v.to.replace(/\W/g, "_"));
    mkdirSync(dir);
    execFileSync("tar", ["-xzf", join(work, tgz), "-C", dir]);
    cpSync(join(dir, v.from), join(out, v.to));
    console.log(`${v.pkg} -> public/preview-vendor/${v.to}`);
  }
  writeFileSync(join(out, "VERSIONS.txt"), VENDOR.map((v) => `${v.to}\t${v.pkg}\t(MIT)`).join("\n") + "\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
