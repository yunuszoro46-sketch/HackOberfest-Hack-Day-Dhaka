"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "@/lib/client/theme";

/** Client-side Mermaid render (strict security level). Shows the parse error instead of a blank area. */
export function MermaidView({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const theme = useTheme().theme;
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
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "paper" ? "neutral" : "dark", fontFamily: "JetBrains Mono, monospace" });
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
  }, [code, id, theme]);

  return (
    <div className="min-h-40 min-w-0 overflow-auto rounded-[6px] border border-line bg-[var(--panel-2)] p-3" data-testid="mermaid-view">
      {error && <pre className="mb-2 whitespace-pre-wrap font-mono text-[13px] text-crit" role="alert">✕ Mermaid did not parse. {error}</pre>}
      {svg ? <div className="[&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : !error && <div className="skeleton h-32" aria-label="Rendering diagram" />}
    </div>
  );
}
