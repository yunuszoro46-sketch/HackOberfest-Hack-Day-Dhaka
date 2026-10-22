// Preview sanitizer. Model HTML is rebuilt from an allow-list: unknown tags and attributes are dropped, every
// model-written <script> is removed, and external resources are stripped. Then the only two scripts the preview may
// run are injected: the Tailwind CDN and TeamMate's own screen switcher. A CSP meta tag blocks anything else, and
// the result is shown in an <iframe sandbox="allow-scripts"> with no same-origin access.

export const TAILWIND_CDN = "https://cdn.tailwindcss.com";

/** The one inline script allowed in a preview: shows one [data-screen] at a time. */
export const SWITCHER_SCRIPT = `(function(){var s=[].slice.call(document.querySelectorAll('[data-screen]'));function show(id){s.forEach(function(e){var on=e.getAttribute('data-screen')===id;if(on){e.removeAttribute('hidden')}else{e.setAttribute('hidden','')}});[].slice.call(document.querySelectorAll('[data-tm-tab]')).forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-tm-tab')===id?'page':'false')})}document.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('[data-goto],[data-tm-tab]');if(!t)return;ev.preventDefault();show(t.getAttribute('data-goto')||t.getAttribute('data-tm-tab'))});if(s.length)show(s[0].getAttribute('data-screen'))})();`;

export const PREVIEW_CSP = `default-src 'none'; script-src 'unsafe-inline' ${TAILWIND_CDN}; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'`;

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

/** Rebuilds the model's HTML from the allow-list and returns the inner head and body. */
function clean(input: string, removed: Set<string>): { head: string; body: string } {
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
        // The Tailwind CDN tag is expected and re-added below; anything else is reported.
        const srcAttr = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/i.exec(m[3]);
        const isTailwind = tag === "script" && !!srcAttr && (srcAttr[1] ?? srcAttr[2] ?? srcAttr[3] ?? "").replace(/\/$/, "") === TAILWIND_CDN;
        if (!isTailwind) removed.add(tag === "script" ? "model-written scripts" : `<${tag}> elements`);
        const end = new RegExp(`</${tag}\\s*>`, "ig");
        end.lastIndex = i;
        const e = end.exec(src);
        i = e ? end.lastIndex : src.length;
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
  const { head, body } = clean(input, removed);
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
<script src="${TAILWIND_CDN}"></script>
${head.trim()}
</head>
<body style="padding-bottom:56px">
${bodyWithoutBar.trim()}
${bar}
<script>${SWITCHER_SCRIPT}</script>
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
