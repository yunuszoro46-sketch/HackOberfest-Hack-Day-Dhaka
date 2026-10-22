// Preview sanitizer. Model HTML is rebuilt from an allow-list: unknown tags and attributes are dropped and external
// resources are stripped. Custom CSS (gradients, animations) is kept after cleaning. Small inline scripts the model
// writes are kept (tagged data-tm-model, so the UI can switch them off), unless they try to navigate, open windows,
// reach the parent page, use storage or eval; external scripts never are. TeamMate injects Tailwind, React + htm when
// the model's code uses them, and its own screen switcher, all from its own server. A CSP meta tag blocks every
// network request and every other script host, and the result runs in <iframe sandbox="allow-scripts"> with no
// same-origin access, no popups, no modals and no top navigation.

/** Legacy: previews made before vendoring loaded Tailwind from here. Still recognised so old previews upgrade. */
export const TAILWIND_CDN = "https://cdn.tailwindcss.com";

/** Replaced at render time: by TeamMate's own /preview-vendor URL in the app, or by pinned CDN URLs in an export. */
export const VENDOR_TOKEN = "__TM_VENDOR__";
export const VENDOR_HOST_TOKEN = "__TM_VENDOR_HOST__";
export const VENDOR_FILES = ["tailwind.js", "react.js", "react-dom.js", "htm.js"] as const;
export const VENDOR_CDN: Record<(typeof VENDOR_FILES)[number], string> = {
  "tailwind.js": "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js",
  "react.js": "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js",
  "react-dom.js": "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js",
  "htm.js": "https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js",
};

/** TeamMate's own script: shows one [data-screen] at a time, and keeps clicks on links inside the preview. */
export const SWITCHER_SCRIPT = `(function(){var s=[].slice.call(document.querySelectorAll('[data-screen]'));function show(id){s.forEach(function(e){var on=e.getAttribute('data-screen')===id;if(on){e.removeAttribute('hidden')}else{e.setAttribute('hidden','')}});[].slice.call(document.querySelectorAll('[data-tm-tab]')).forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-tm-tab')===id?'page':'false')})}document.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('[data-goto],[data-tm-tab]');if(t){ev.preventDefault();show(t.getAttribute('data-goto')||t.getAttribute('data-tm-tab'));return}var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(a&&!/^#/.test(a.getAttribute('href')||''))ev.preventDefault()},true);if(s.length)show(s[0].getAttribute('data-screen'))})();`;
const SWITCHER_PREFIX = "(function(){var s=[].slice.call(document.querySelectorAll('[data-screen]'));";

export const PREVIEW_CSP = `default-src 'none'; script-src 'unsafe-inline' ${VENDOR_HOST_TOKEN}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;

const MAX_MODEL_SCRIPTS = 4;
const MAX_SCRIPT_BYTES = 40_000;
/** Model code that reaches outside the preview: dropped whole. A heuristic on top of the sandbox and CSP, not instead of them. */
const FORBIDDEN_JS = /(?:\b(?:window|document|self|globalThis|frames)\s*\.\s*location\b)|\blocation\s*(?:\.\s*(?:href|assign|replace|reload)\b|=[^=])|window\.open|\bopen\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\beval\s*\(|\bFunction\s*\(|\bparent\s*\.|\btop\s*\.|\bopener\b|postMessage|document\.cookie|document\.domain|localStorage|sessionStorage|indexedDB|\bimport\s*\(|\.src\s*=|setAttribute\s*\(\s*['"](?:src|href|action|formaction)|\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/;
/** Script tags the sanitizer adds itself; a model copy of them is dropped silently. */
const KNOWN_LIB = /(?:^|\/)(?:tailwind(?:css)?|react|react-dom|htm)(?:[@\/.][\w.@\/-]*)?$|cdn\.tailwindcss\.com|__TM_VENDOR__/i;

const ALLOWED_TAGS = new Set([
  "html", "head", "body", "title", "meta", "style",
  "main", "header", "footer", "nav", "section", "article", "aside", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "a", "button", "form", "input", "textarea", "select", "option", "label", "fieldset", "legend",
  "img", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "strong", "em", "b", "i", "u", "s", "small", "mark", "br", "hr", "blockquote", "pre", "code", "time", "progress", "details", "summary",
  "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "ellipse", "defs", "lineargradient", "radialgradient", "stop", "text", "tspan",
]);
const VOID = new Set(["meta", "br", "hr", "img", "input", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "stop"]);
/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set(["script", "noscript", "template", "iframe", "object", "embed", "applet", "frame", "frameset", "math"]);

const ALLOWED_ATTRS = new Set([
  "class", "id", "role", "title", "alt", "type", "name", "value", "placeholder", "checked", "disabled", "selected", "for", "rows", "cols",
  "colspan", "rowspan", "width", "height", "min", "max", "step", "required", "readonly", "tabindex", "hidden", "lang", "dir", "open", "datetime",
  "href", "src", "style", "charset", "content",
  "viewbox", "xmlns", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "d", "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "y1", "x2", "y2", "points", "transform", "opacity", "fill-rule", "clip-rule", "offset", "stop-color", "stop-opacity",
  "gradientunits", "text-anchor", "font-size", "font-weight", "preserveaspectratio",
]);

export interface SanitizedPreview {
  html: string;
  screens: { id: string; title: string }[];
  /** Human-readable notes on what was removed, for transparency. */
  removed: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&(colon|tab|newline);/gi, (_, n) => ({ colon: ":", tab: "\t", newline: "\n" })[n.toLowerCase() as "colon"]);

/** CSS may not load anything: no url() except data:, no @import, no expression(). */
function safeCss(css: string, removed: Set<string>): string {
  let out = css.replace(/@import[^;]*;?/gi, () => (removed.add("CSS @import"), ""));
  out = out.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, u: string) => (/^data:(image|font)\//i.test(u.trim()) ? m : (removed.add("external url() in CSS"), "none")));
  // Drop the whole declaration, not just the keyword.
  out = out.replace(/[^;{}]*(?:expression\s*\(|javascript:|behavior\s*:|-moz-binding)[^;{}]*;?/gi, () => (removed.add("script in CSS"), ""));
  return out;
}

function attrs(tag: string, raw: string, removed: Set<string>): string {
  const out: string[] = [];
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = decode(m[2] ?? m[3] ?? m[4] ?? "");
    const ok = name.startsWith("data-") || name.startsWith("aria-") || ALLOWED_ATTRS.has(name);
    if (!ok) {
      if (name.startsWith("on")) removed.add("inline event handlers");
      else if (["srcset", "formaction", "action", "xlink:href", "background", "poster", "ping", "http-equiv"].includes(name)) removed.add(`${name} attribute`);
      continue;
    }
    let v = value;
    if (name === "href") {
      if (tag !== "a" || !/^#[\w-]*$/.test(v.trim())) {
        if (/^\s*javascript:/i.test(v)) removed.add("javascript: links");
        else if (v.trim() && !v.trim().startsWith("#")) removed.add("external links");
        v = "#";
      }
    } else if (name === "src") {
      if (tag !== "img" || !/^data:image\/(png|gif|jpe?g|webp|svg\+xml);/i.test(v.trim())) {
        removed.add("external images");
        continue;
      }
    } else if (name === "style") {
      v = safeCss(v, removed);
    } else if (name === "content" && tag === "meta" && /url\s*=/i.test(v)) {
      removed.add("meta refresh");
      continue;
    }
    out.push(m[2] === undefined && m[3] === undefined && m[4] === undefined ? ` ${name}` : ` ${name}="${esc(v)}"`);
  }
  return out.join("");
}

/** Rebuilds the model's HTML from the allow-list and returns the inner head and body, plus the model's own scripts. */
function clean(input: string, removed: Set<string>, scriptsOut: string[] = []): { head: string; body: string } {
  const src = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/gi, "").replace(/<\?[\s\S]*?\?>/g, "");
  let out = "";
  let i = 0;
  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*(\/?)>/y;
  let guard = 0;
  while (i < src.length) {
    // Every iteration must move forward; this cap turns any future bug into a truncated preview, not a hung server.
    if (++guard > src.length + 10) break;
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      out += src.slice(i).replace(/>/g, "&gt;");
      break;
    }
    out += src.slice(i, lt).replace(/>/g, "&gt;");
    tagRe.lastIndex = lt;
    const m = tagRe.exec(src);
    if (!m) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    i = tagRe.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing) {
        const end = new RegExp(`</${tag}\\s*>`, "ig");
        end.lastIndex = i;
        const e = end.exec(src);
        const content = src.slice(i, e ? e.index : src.length);
        i = e ? end.lastIndex : src.length;
        if (tag === "script") keepScript(m[3], content, removed, scriptsOut);
        else removed.add(`<${tag}> elements`);
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      if (["link", "base", "audio", "video", "source", "track", "picture", "use", "image", "foreignobject", "portal"].includes(tag)) removed.add(`<${tag}> elements`);
      continue;
    }
    if (tag === "meta" && !closing && !/\bcharset\b|name\s*=\s*["']?viewport/i.test(m[3])) {
      removed.add("meta tags other than charset/viewport");
      continue;
    }
    if (tag === "style") {
      if (closing) continue;
      const end = /<\/style\s*>/gi;
      end.lastIndex = i;
      const e = end.exec(src);
      const css = src.slice(i, e ? e.index : src.length);
      i = e ? end.lastIndex : src.length;
      out += `<style>${safeCss(css, removed).replace(/<\//g, "<\\/")}</style>`;
      continue;
    }
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at >= 0) {
        out += stack.splice(at).reverse().map((t) => `</${t}>`).join("");
      }
      continue;
    }
    out += `<${tag}${attrs(tag, m[3], removed)}>`;
    if (!VOID.has(tag) && m[4] !== "/") stack.push(tag);
    else if (m[4] === "/" && !VOID.has(tag)) out += `</${tag}>`;
  }
  out += stack.reverse().map((t) => `</${t}>`).join("");

  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(out)?.[1] ?? "";
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(out);
  const body = bodyMatch ? bodyMatch[1] : out.replace(/<\/?html[^>]*>/gi, "").replace(/<head[^>]*>[\s\S]*?<\/head>/i, "");
  return { head: head.replace(/<meta[^>]*>/gi, ""), body };
}

/** Decides what happens to one <script> the model wrote. Only small, self-contained inline scripts survive. */
function keepScript(rawAttrs: string, content: string, removed: Set<string>, out: string[]) {
  const srcAttr = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/i.exec(rawAttrs);
  if (srcAttr) {
    const url = (srcAttr[1] ?? srcAttr[2] ?? srcAttr[3] ?? "").trim().replace(/\/$/, "");
    // Tailwind, React, ReactDOM and htm are provided by TeamMate; the model's copy is dropped silently.
    let known = false;
    try {
      const u = new URL(url, "https://x.invalid");
      known = url === TAILWIND_CDN || url.startsWith(VENDOR_TOKEN) || (["https://x.invalid", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://esm.sh"].includes(u.origin) && KNOWN_LIB.test(u.pathname.replace(/\.(?:production\.min|development|umd|min)?\.?js$/, "")));
    } catch {
      known = false;
    }
    if (!known) removed.add("external scripts");
    return;
  }
  const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(rawAttrs)?.[1]?.toLowerCase();
  if (type && type !== "text/javascript" && type !== "application/javascript") {
    removed.add(type === "text/babel" ? "JSX scripts (use htm instead)" : `scripts of type ${type}`);
    return;
  }
  const code = content.trim();
  if (!code || code.startsWith(SWITCHER_PREFIX)) return;
  if (FORBIDDEN_JS.test(code)) {
    removed.add("scripts that reach outside the preview (navigation, network, storage, eval, dialogs)");
    return;
  }
  if (out.length >= MAX_MODEL_SCRIPTS || out.join("").length + code.length > MAX_SCRIPT_BYTES) {
    removed.add("scripts beyond the size limit");
    return;
  }
  // "<!--" inside a script can change how the closing tag is parsed; escaping it is harmless in JS strings.
  out.push(code.replace(/<!--/g, "<\\!--").replace(/<\/script/gi, "<\\/script"));
}

/** Screens in document order: <section data-screen="id" data-title="Name">. */
export function findScreens(html: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const re = /<[a-z]+\b[^>]*\bdata-screen="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (out.some((s) => s.id === m![1])) continue;
    const title = /\bdata-title="([^"]*)"/i.exec(m[0])?.[1];
    out.push({ id: m[1], title: title || m[1].replace(/[-_]/g, " ") });
  }
  return out;
}

/** Sanitizes model HTML into a self-contained preview document. Idempotent. */
export function sanitizePreview(input: string): SanitizedPreview {
  const removed = new Set<string>();
  const modelScripts: string[] = [];
  const { head, body } = clean(input, removed, modelScripts);
  const usesReact = modelScripts.some((c) => /\b(?:React|ReactDOM|htm)\b/.test(c));
  const libs = usesReact ? ["react.js", "react-dom.js", "htm.js"].map((f) => `<script src="${VENDOR_TOKEN}/${f}"></script>`).join("\n") + "\n" : "";
  const bodyWithoutBar = body.replace(/<nav[^>]*data-tm-switcher[^>]*>[\s\S]*?<\/nav>/gi, "");
  const screens = findScreens(bodyWithoutBar).slice(0, 5);
  const bar = screens.length
    ? `<nav data-tm-switcher aria-label="Preview screens" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;gap:4px;justify-content:center;padding:6px;background:rgba(17,17,17,.88);font:12px system-ui,sans-serif">${screens
        .map((s, i) => `<button type="button" data-tm-tab="${esc(s.id)}" style="color:#fff;background:transparent;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:4px 10px;cursor:pointer">${i + 1}. ${esc(s.title)}</button>`)
        .join("")}</nav>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<script src="${VENDOR_TOKEN}/tailwind.js"></script>
${head.trim()}
</head>
<body style="padding-bottom:56px">
${bodyWithoutBar.trim()}
${bar}
${libs}${modelScripts.map((c) => `<script data-tm-model>${c}</script>\n`).join("")}<script>${SWITCHER_SCRIPT}</script>
</body>
</html>`;
  return { html, screens, removed: [...removed] };
}

/** Why a generated preview is unusable, or null. Used for the one retry. */
export function previewProblem(html: string): string | null {
  const n = findScreens(clean(html, new Set()).body).length;
  if (n < 3) return `It has ${n} screen${n === 1 ? "" : "s"}; it needs 3 to 5 <section data-screen="..."> elements.`;
  if (n > 5) return `It has ${n} screens; use at most 5.`;
  return null;
}

/** The preview with the model's own scripts removed (TeamMate's switcher and libraries stay). */
export const withoutModelScripts = (html: string) => html.replace(/<script data-tm-model>[\s\S]*?<\/script>\n?/g, "");

/**
 * The document to show. In the app, scripts load from TeamMate's own /preview-vendor; in an exported preview.html,
 * from pinned jsDelivr URLs. Older previews (Tailwind CDN) are re-sanitized, which upgrades them.
 */
export function previewDocument(html: string, where: { origin: string } | "export", opts: { scripts?: boolean } = {}): string {
  let doc = html.includes(VENDOR_TOKEN) ? html : sanitizePreview(html).html;
  if (opts.scripts === false) doc = withoutModelScripts(doc);
  if (where === "export") {
    for (const f of VENDOR_FILES) doc = doc.split(`${VENDOR_TOKEN}/${f}`).join(VENDOR_CDN[f]);
    return doc.split(VENDOR_HOST_TOKEN).join("https://cdn.jsdelivr.net");
  }
  return doc.split(VENDOR_TOKEN).join(`${where.origin}/preview-vendor`).split(VENDOR_HOST_TOKEN).join(where.origin);
}
