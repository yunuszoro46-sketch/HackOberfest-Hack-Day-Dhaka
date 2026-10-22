"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader } from "@/components/console/Panel";
import { useToast } from "@/components/console/Toast";
import { shareLink } from "@/lib/share";
import { planFingerprint } from "@/lib/signoff";
import type { IdeaCard, Review } from "@/lib/schema/ideaCard";

export const REVIEW_UI: Record<Review["verdict"], { label: string; icon: string; tone: "ok" | "warn" | "crit" }> = {
  approve: { label: "approved", icon: "✓", tone: "ok" },
  changes: { label: "approved with changes", icon: "~", tone: "warn" },
  reject: { label: "do not build yet", icon: "✕", tone: "crit" },
};

/** Share a read-only link for review, and list the reviews that came back. */
export function ReviewPanel({ card }: { card: IdeaCard }) {
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const plan = planFingerprint(card);

  const make = async () => {
    const l = await shareLink(window.location.origin, card);
    setLink(l);
    try {
      await navigator.clipboard.writeText(l);
      toast("Review link copied");
    } catch {
      toast("Clipboard blocked. Select the link below and copy it.", "crit");
    }
  };

  return (
    <Panel aria-labelledby="share-h" data-testid="review-panel">
      <PanelHeader id="share-h" title="Share for review" right={card.reviews.length ? <Chip>{card.reviews.length} review{card.reviews.length === 1 ? "" : "s"}</Chip> : undefined} />
      <PanelBody className="space-y-3">
        <p className="text-[14px] text-fg-dim">A read-only link for a mentor or teammate. The plan travels inside the link (after the #), so no server stores it. They reply with a link that adds their review here.</p>
        <Button size="sm" onClick={make} data-testid="share-link"><Share2 /> Create review link</Button>
        {link && (
          <div className="space-y-1">
            <label htmlFor="share-url" className="label-mono">Review link{link.length > 30_000 ? " (long: send it by email or as a file if a chat app cuts it)" : ""}</label>
            <textarea id="share-url" readOnly rows={2} className="field font-mono text-[12px]" value={link} onFocus={(e) => e.currentTarget.select()} data-testid="share-url" />
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Review link copied"), () => toast("Clipboard blocked. Select the link and copy it.", "crit"))}><Copy /> Copy again</Button>
          </div>
        )}
        {card.reviews.length > 0 && (
          <ul className="space-y-3 border-t border-line pt-3" data-testid="reviews">
            {[...card.reviews].reverse().map((r) => (
              <li key={r.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.reviewer}</span>
                  <Chip tone={REVIEW_UI[r.verdict].tone} icon={<span aria-hidden="true">{REVIEW_UI[r.verdict].icon}</span>}>{REVIEW_UI[r.verdict].label}</Chip>
                  {r.planFingerprint !== plan && <Chip tone="warn" icon={<span aria-hidden="true">!</span>}>plan changed since</Chip>}
                  <span className="font-mono text-[12px] text-fg-faint">{new Date(r.at).toLocaleDateString()}</span>
                </div>
                {r.decisions.filter((d) => d.stance === "question").map((d) => (
                  <p key={d.question} className="text-[14px]"><span className="text-warn" aria-hidden="true">? </span><span className="text-fg-dim">{d.question}</span>{d.comment && <> — {d.comment}</>}</p>
                ))}
                {r.note && <p className="text-[14px] text-fg-dim">“{r.note}”</p>}
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
