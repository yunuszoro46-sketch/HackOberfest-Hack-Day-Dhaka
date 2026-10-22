import { describe, expect, it } from "vitest";
import { findScreens, previewDocument, previewProblem, sanitizePreview, SWITCHER_SCRIPT, TAILWIND_CDN, VENDOR_TOKEN, withoutModelScripts } from "@/lib/preview/sanitize";

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

  it("sets a CSP that allows inline scripts and TeamMate's own vendor host only, and no network at all", () => {
    const out = sanitizePreview(doc(screens)).html;
    expect(out).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' __TM_VENDOR_HOST__;/);
    expect(out).toMatch(/connect-src 'none'/);
    expect(out).toMatch(/form-action 'none'/);
  });
});

describe("preview sanitizer — the allowed scripts", () => {
  it("drops a model script that reaches the network, keeping only TeamMate's Tailwind and switcher", () => {
    const modelSwitcher = `<script>document.querySelectorAll('[data-screen]').forEach(s=>s.hidden=true);fetch('https://x.example')</script>`;
    const out = sanitizePreview(doc(screens + modelSwitcher, `<script src="${TAILWIND_CDN}"></script>`)).html;
    expect(scripts(out)).toEqual([
      { attrs: `src="${VENDOR_TOKEN}/tailwind.js"`, body: "" },
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
    expect(sanitizePreview(doc(screens, `<script src="https://cdn.tailwindcss.com.evil.example/x.js"></script>`)).removed).toEqual(["external scripts"]);
    expect(sanitizePreview(doc(screens, `<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>`)).removed).toEqual([]);
  });
});

describe("preview sanitizer — CSS, JavaScript and React the model may use", () => {
  const counter = `<script>var n=0;document.getElementById("c").addEventListener("click",function(){n++;this.textContent=n})</script>`;
  const react = `<div id="app"></div><script>const html=htm.bind(React.createElement);ReactDOM.createRoot(document.getElementById("app")).render(html\`<p>Hi</p>\`)</script>`;

  it("keeps gradients and keyframes in <style> and style attributes", () => {
    const out = sanitizePreview(doc(`${screens}<div style="background:linear-gradient(90deg,#4f46e5,#ec4899)">x</div>`, `<style>.h{background:radial-gradient(circle,#6366f1,transparent)}@keyframes a{from{opacity:0}to{opacity:1}}</style>`)).html;
    expect(out).toContain("radial-gradient(circle,#6366f1,transparent)");
    expect(out).toContain("@keyframes a");
    expect(out).toContain("linear-gradient(90deg,#4f46e5,#ec4899)");
  });

  it("keeps a small inline script, tagged, after the content and before the switcher; loads React only when used", () => {
    const plain = sanitizePreview(doc(`${screens}<button id="c">0</button>${counter}`));
    const s = scripts(plain.html);
    expect(s.map((x) => x.attrs)).toEqual([`src="${VENDOR_TOKEN}/tailwind.js"`, "data-tm-model", ""]);
    expect(s[1].body).toContain("addEventListener");
    expect(plain.removed).toEqual([]);
    const withReact = scripts(sanitizePreview(doc(screens + react)).html).map((x) => x.attrs);
    expect(withReact).toEqual([`src="${VENDOR_TOKEN}/tailwind.js"`, `src="${VENDOR_TOKEN}/react.js"`, `src="${VENDOR_TOKEN}/react-dom.js"`, `src="${VENDOR_TOKEN}/htm.js"`, "data-tm-model", ""]);
  });

  it("drops scripts that navigate, open windows, reach the parent, use storage, eval or dialogs; keeps harmless words", () => {
    for (const bad of ["location.href='https://x.example'", "window.location='x'", "window.open('x')", "parent.postMessage(1,'*')", "top.location.reload()", "localStorage.setItem('a',1)", "eval('1')", "new Function('1')", "document.cookie", "img.src='https://x.example/p.gif'", "confirm('ok?')"]) {
      const r = sanitizePreview(doc(`${screens}<script>${bad}</script>`));
      expect(scripts(r.html).filter((x) => x.attrs === "data-tm-model"), bad).toHaveLength(0);
      expect(r.removed).toEqual(["scripts that reach outside the preview (navigation, network, storage, eval, dialogs)"]);
    }
    const ok = sanitizePreview(doc(`${screens}<script>document.querySelector("p").textContent = "Pick a location near the parent building"</script>`));
    expect(scripts(ok.html).filter((x) => x.attrs === "data-tm-model")).toHaveLength(1);
  });

  it("limits model scripts to four, rejects JSX and module scripts, and escapes comment openers", () => {
    const many = Array.from({ length: 6 }, (_, i) => `<script>var a${i}=1</script>`).join("");
    const r = sanitizePreview(doc(screens + many));
    expect(scripts(r.html).filter((x) => x.attrs === "data-tm-model")).toHaveLength(4);
    expect(r.removed).toContain("scripts beyond the size limit");
    expect(sanitizePreview(doc(`${screens}<script type="text/babel">const a = <p/></script>`)).removed).toEqual(["JSX scripts (use htm instead)"]);
    expect(sanitizePreview(doc(`${screens}<script type="module">import x from "y"</script>`)).removed).toEqual(["scripts of type module"]);
    expect(sanitizePreview(doc(`${screens}<script>var s="<!--"</script>`)).html).toContain('var s="<\\!--"');
  });

  it("is idempotent with model scripts, and can strip them for the JS-off view", () => {
    const once = sanitizePreview(doc(screens + react)).html;
    expect(sanitizePreview(once).html).toBe(once);
    const off = withoutModelScripts(once);
    expect(off).not.toContain("data-tm-model");
    expect(off).toContain(SWITCHER_SCRIPT);
  });

  it("renders with TeamMate's own vendor files in the app and pinned CDN files in an export; upgrades old previews", () => {
    const html = sanitizePreview(doc(screens + react)).html;
    const app = previewDocument(html, { origin: "https://tm.example" });
    expect(app).toContain('src="https://tm.example/preview-vendor/react.js"');
    expect(app).toContain("script-src 'unsafe-inline' https://tm.example;");
    expect(app).not.toContain("__TM_");
    const exp = previewDocument(html, "export");
    expect(exp).toContain('src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"');
    expect(exp).toContain("script-src 'unsafe-inline' https://cdn.jsdelivr.net;");
    const legacy = `<!doctype html><html><head><script src="${TAILWIND_CDN}"></script></head><body>${screens}</body></html>`;
    const up = previewDocument(legacy, { origin: "https://tm.example" });
    expect(up).toContain("https://tm.example/preview-vendor/tailwind.js");
    expect(up).not.toContain("cdn.tailwindcss.com");
    expect(previewDocument(html, { origin: "https://tm.example" }, { scripts: false })).not.toContain("data-tm-model");
  });
});
