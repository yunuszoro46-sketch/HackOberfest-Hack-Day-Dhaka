/** Pulls the first JSON object or array out of a model reply (code fences and chatter around it are ignored). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    // fall through to a bracket scan
  }
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("No JSON object found in the reply");
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("Unterminated JSON in the reply");
}

/** Pulls an HTML document out of a model reply. */
export function extractHtml(text: string): string {
  const fenced = /```(?:html)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<html/i);
  const end = body.toLowerCase().lastIndexOf("</html>");
  if (start >= 0 && end > start) return body.slice(start, end + "</html>".length);
  return body;
}
