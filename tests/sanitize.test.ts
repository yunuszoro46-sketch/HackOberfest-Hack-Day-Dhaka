import { describe, expect, it } from "vitest";
import { findScreens, previewProblem, sanitizePreview, SWITCHER_SCRIPT, TAILWIND_CDN } from "@/lib/preview/sanitize";

const doc = (body: string, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const screens = `<section data-screen="home" data-title="Home"><h1>Rooms</h1><button data-goto="book">Book</button></section>
<section data-screen="book" data-title="Book"><form><input name="q"></form></section>
<section data-screen="done" data-title="Done"><p>Booked</p></section>`;

/** All <script> tags in the output, with their src and body. */
const scripts = (html: string) => [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1].trim(), body: m[2] }));

describe("preview sanitizer — script injection", () => {
  const attacks: [string, string][] = [
    ["script tag", `<script>alert(1)</script>`],
    ["script with src", `<script src="https://evil.example/x.js"></script>`],
    ["uppercase script", `<SCRIPT>alert(1)</SCRIPT>`],
    ["split script", `<scr<script>ipt>alert(1)</scr</script>ipt>`],
    ["img onerror", `<img src=x onerror="alert(1)">`],
    ["svg onload", `<svg onload="alert(1)"><circle r="2"/></svg>`],
    ["javascript href", `<a href="javascript:alert(1)">x</a>`],
    ["entity-encoded javascript href", `<a href="javascript&#58;alert(1)">x</a>`],
    ["body onload", `<body onload="alert(1)">`],
    ["iframe", `<iframe src="https://evil.example"></iframe>`],
    ["object/embed", `<object data="x.swf"></object><embed src="x.swf">`],
    ["button formaction", `<button formaction="javascript:alert(1)">x</button>`],
    ["meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.example">`],
    ["css expression", `<div style="width: expression(alert(1))">x</div>`],
    ["template", `<template><script>alert(1)</script></template>`],
  ];
  for (const [name, attack] of attacks) {
    it(`neutralises ${name}`, () => {
      const out = sanitizePreview(doc(screens + attack)).html;
      expect(out).not.toMatch(/alert\(1\)/i);
      expect(out).not.toMatch(/\son[a-z]+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/evil\.example/);
      expect(out).not.toMatch(/<(iframe|object|embed|template)\b/i);
      expect(scripts(out)).toHaveLength(2);
    });
  }

  it("treats malformed tags as text instead of markup", () => {
    const out = sanitizePreview(doc(`${screens}<img/src=x onerror=alert(1)>`)).html;
    expect(out).toContain("&lt;img/src=x onerror=alert(1)&gt;");
  });

  it("finishes quickly on pathological input", () => {
    const evil = `<div ${"a=\"b\" ".repeat(5000)}` + "x".repeat(20000);
    const t = Date.now();
    sanitizePreview(doc(screens + evil));
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe("preview sanitizer — external resources", () => {
  it("strips external images, stylesheets, @import, CSS urls, links and fonts", () => {
    const r = sanitizePreview(
      doc(
        `${screens}<img src="https://cdn.example/a.png" alt="a"><img src="data:image/png;base64,AAAA" alt="ok"><a href="https://example.com">out</a><a href="#home">in</a><div style="background:url(https://track.example/p.gif)">x</div><video src="https://v.example/a.mp4"></video>`,
        `<link rel="stylesheet" href="https://fonts.example/css"><style>@import url("https://fonts.example/x.css"); .a{background:url('https://t.example/x.png')} .b{background:url(data:image/png;base64,AA)}</style><base href="https://evil.example/">`,
      ),
    );
    const out = r.html;
    expect(out).not.toMatch(/cdn\.example|fonts\.example|track\.example|t\.example|v\.example|evil\.example|example\.com/);
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).toContain('<a href="#home">in</a>');
    expect(out).toContain('<a href="#">out</a>');
    expect(out).toContain("url(data:image/png;base64,AA)");
    expect(out).not.toMatch(/<(link|base|video)\b/i);
    expect(r.removed).toEqual(expect.arrayContaining(["external images", "external links", "CSS @import", "external url() in CSS", "<link> elements", "<base> elements"]));
  });

  it("sets a CSP that only allows inline scripts and the Tailwind CDN", () => {
    const out = sanitizePreview(doc(screens)).html;
    expect(out).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:\/\/cdn\.tailwindcss\.com;/);
    expect(out).toMatch(/form-action 'none'/);
  });
});

describe("preview sanitizer — the allowed scripts", () => {
  it("keeps exactly the Tailwind CDN and TeamMate's switcher, even if the model wrote its own switcher", () => {
    const modelSwitcher = `<script>document.querySelectorAll('[data-screen]').forEach(s=>s.hidden=true);fetch('https://x.example')</script>`;
    const out = sanitizePreview(doc(screens + modelSwitcher, `<script src="${TAILWIND_CDN}"></script>`)).html;
    const s = scripts(out);
    expect(s).toEqual([
      { attrs: `src="${TAILWIND_CDN}"`, body: "" },
      { attrs: "", body: SWITCHER_SCRIPT },
    ]);
    expect(out).not.toContain("x.example");
  });

  it("adds a bottom screen-switcher bar for every screen (max 5) and is idempotent", () => {
    const r = sanitizePreview(doc(screens));
    expect(r.screens).toEqual([{ id: "home", title: "Home" }, { id: "book", title: "Book" }, { id: "done", title: "Done" }]);
    expect(r.html.match(/data-tm-tab=/g)).toHaveLength(3);
    const again = sanitizePreview(r.html);
    expect(again.html).toBe(r.html);
  });

  it("keeps data-goto navigation, forms without actions, and svg", () => {
    const out = sanitizePreview(doc(`${screens}<form action="https://x.example"><button type="submit">Go</button></form><svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="currentColor"/></svg>`)).html;
    expect(out).toContain('<button data-goto="book">Book</button>');
    expect(out).toContain('<form><button type="submit">Go</button></form>');
    expect(out).toContain('<svg viewbox="0 0 10 10"><path d="M0 0L10 10" stroke="currentColor"></svg>');
  });
});

describe("preview validation", () => {
  it("needs 3 to 5 screens", () => {
    expect(previewProblem(doc(screens))).toBeNull();
    expect(previewProblem(doc(`<section data-screen="a"></section>`))).toMatch(/1 screen;/);
    expect(previewProblem(doc(Array.from({ length: 6 }, (_, i) => `<section data-screen="s${i}"></section>`).join("")))).toMatch(/6 screens/);
    expect(findScreens(`<section data-screen="a" data-title="Start"></section>`)).toEqual([{ id: "a", title: "Start" }]);
  });
});

describe("preview sanitizer — reporting", () => {
  it("does not report the expected Tailwind CDN tag as removed, but does report other scripts", () => {
    expect(sanitizePreview(doc(screens, `<script src="${TAILWIND_CDN}"></script>`)).removed).toEqual([]);
    expect(sanitizePreview(doc(screens, `<script src="https://cdn.tailwindcss.com.evil.example/x.js"></script>`)).removed).toEqual(["model-written scripts"]);
  });
});
