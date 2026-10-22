"use client";

import { useEffect, useId, useState } from "react";

/** Client-side Mermaid render (strict security level). Shows the parse error instead of a blank area. */
export function MermaidView({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!code.trim()) {
        setSvg(null);
        setError(null);
        return;
      }
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
        await mermaid.parse(code);
        const out = await mermaid.render(`${id}-${Date.now()}`, code);
        if (!cancelled) {
          setSvg(out.svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message?.split("\n").slice(0, 4).join("\n") || "Invalid Mermaid");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id]);

  return (
    <div className="min-h-40 overflow-auto rounded-md border bg-background p-3" data-testid="mermaid-view">
      {error && <pre className="mb-2 whitespace-pre-wrap text-xs text-destructive" role="alert">{error}</pre>}
      {svg ? <div className="[&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : !error && <p className="text-sm text-muted-foreground">Rendering…</p>}
    </div>
  );
}
