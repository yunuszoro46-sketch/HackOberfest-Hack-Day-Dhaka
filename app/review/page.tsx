"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { Crumb, TopBar } from "@/components/console/TopBar";
import { useToast } from "@/components/console/Toast";
import { sanitizePreview } from "@/lib/preview/sanitize";
import { outOfScopeOf } from "@/lib/prompts/common";
import { projectName } from "@/lib/prompts/compile";
import { PERSONA_BRIEFS } from "@/lib/prompts/council";
import { readSharedCard, reviewLink } from "@/lib/share";
import { planFingerprint, signoffDecisions } from "@/lib/signoff";
import { chosenDirection, PERSONAS, type IdeaCard, type Review } from "@/lib/schema/ideaCard";
import { councilVerdict } from "@/lib/verdict";
import { cn } from "@/lib/utils";

type Stance = "agree" | "question";
const VERDICTS: { id: Review["verdict"]; label: string; icon: string; tone: string }[] = [
  { id: "approve", label: "Approve the plan", icon: "✓", tone: "border-ok text-ok" },
  { id: "changes", label: "Approve with changes", icon: "~", tone: "border-warn text-warn" },
  { id: "reject", label: "Do not build this yet", icon: "✕", tone: "border-crit text-crit" },
];

export default function ReviewPage() {
  const toast = useToast();
  const [card, setCard] = useState<IdeaCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [verdict, setVerdict] = useState<Review["verdict"] | null>(null);
  const [stances, setStances] = useState<{ stance: Stance; comment: string }[]>([]);
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    readSharedCard(window.location.hash)
      .then((c) => {
        setCard(c);
        setStances(signoffDecisions(c).map(() => ({ stance: "agree", comment: "" })));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const preview = useMemo(() => {
    const html = card ? chosenDirection(card)?.previewHtml : undefined;
    return html ? sanitizePreview(html).html : null;
  }, [card]);

  if (error) {
    return (
      <>
        <TopBar crumbs={[<Crumb key="t" href="/">TeamMate</Crumb>, <Crumb key="r">Review</Crumb>]} />
        <main className="mx-auto max-w-xl space-y-3 p-8" role="alert"><p className="text-[16px]"><span className="text-crit">✕ </span>{error}</p><p className="text-fg-dim">Ask the builder to send the review link again.</p></main>
      </>
    );
  }
  if (!card) return <main className="p-8"><div className="skeleton h-6 w-64" /></main>;

  const decisions = signoffDecisions(card);
  const dir = chosenDirection(card);
  const v = councilVerdict(card);
  const stack = card.architecture?.candidates.find((c) => c.id === card.architecture?.chosenId);

  const makeReply = async () => {
    if (!verdict) return;
    const review: Review = {
      id: `rev-${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      reviewer: name.trim().slice(0, 80) || "Anonymous reviewer",
      verdict,
      decisions: decisions.map((d, i) => ({ question: d.question, answer: d.answer.slice(0, 600), stance: stances[i]?.stance ?? "agree", comment: (stances[i]?.comment ?? "").slice(0, 600) })),
      note: note.slice(0, 1500),
      planFingerprint: planFingerprint(card),
    };
    setLink(await reviewLink(window.location.origin, card.id, review));
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Reply link copied");
    } catch {
      (document.getElementById("reply-link") as HTMLTextAreaElement | null)?.select();
      toast("Clipboard blocked. The link is selected; press Ctrl+C.", "crit");
    }
  };

  return (
    <>
      <TopBar crumbs={[<Crumb key="t" href="/">TeamMate</Crumb>, <Crumb key="r">Review</Crumb>]} />
      <main className="mx-auto w-full max-w-[1180px] space-y-5 px-4 py-6 sm:px-6" data-testid="review-page">
        <StageHeading eyebrow="Read-only review" title={<>Review the plan for <span className="text-amber">{projectName(card)}</span>.</>}
          lead="Someone building this asked for a second pair of eyes before a coding agent builds it. Nothing on this page is sent to a server; your reply is a link you send back." />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-4">
            <Panel aria-labelledby="rc-h">
              <PanelHeader id="rc-h" title="The idea" />
              <PanelBody>
                <dl className="space-y-3 text-[15px]">
                  {[["Core action", card.coreAction.value], ["Problem", card.problem.value], ["Target user", card.targetUser.value], ["Why now", card.whyNow.value], ["Out of scope", outOfScopeOf(card).join(" · ")]].map(([k, val]) => (
                    <div key={k}><dt className="label-mono">{k}</dt><dd>{val || <span className="text-fg-faint">Not set</span>}</dd></div>
                  ))}
                </dl>
              </PanelBody>
            </Panel>

            {card.council && (
              <Panel aria-labelledby="rv-h">
                <PanelHeader id="rv-h" title="What the critics said" />
                <PanelBody className="space-y-3">
                  {v && <p className="text-[15px]"><span className="font-semibold">{v.summary}</span></p>}
                  <ul className="space-y-2 text-[15px]">
                    {PERSONAS.map((p) => <li key={p}><span className="font-semibold">{PERSONA_BRIEFS[p].title}</span> <span className="font-mono text-[13px] text-fg-dim">({card.council![p].verdict}, {card.council![p].solidity}/5)</span>: {card.council![p].strongest_objection}</li>)}
                  </ul>
                </PanelBody>
              </Panel>
            )}

            {dir && (
              <Panel aria-labelledby="rd-h">
                <PanelHeader id="rd-h" title={`Direction: ${dir.title}`} right={card.previewApprovedId === dir.id ? <Chip tone="ok" icon={<span aria-hidden="true">✓</span>}>preview approved</Chip> : undefined} />
                <PanelBody className="space-y-3">
                  <p className="text-[15px]">{dir.oneLiner}</p>
                  <p className="text-[14px] text-fg-dim">{dir.rationale}</p>
                  {preview && (
                    <div className="overflow-hidden rounded-[8px] border border-line bg-white">
                      <iframe title={`Preview of ${dir.title}`} sandbox="allow-scripts" srcDoc={preview} className="block h-[420px] w-full" data-testid="review-preview" />
                    </div>
                  )}
                </PanelBody>
              </Panel>
            )}

            {stack && (
              <Panel aria-labelledby="rs-h">
                <PanelHeader id="rs-h" title={`Stack: ${stack.name}`} />
                <PanelBody className="space-y-2 text-[15px]">
                  <p className="font-mono text-[13px] text-fg-dim">{stack.stack.join(" · ")}</p>
                  {card.architecture!.apiSurface.value.length > 0 && (
                    <ul className="space-y-1 font-mono text-[13px]">{card.architecture!.apiSurface.value.map((e, i) => <li key={i}><span className="text-amber">{e.method}</span> {e.path}</li>)}</ul>
                  )}
                  {card.architecture!.risks.value.length > 0 && <p className="text-[14px] text-fg-dim">Risks: {card.architecture!.risks.value.map((r) => r.risk).join("; ")}</p>}
                </PanelBody>
              </Panel>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <Panel aria-labelledby="rr-h" className="lg:sticky lg:top-[68px]">
              <PanelHeader id="rr-h" title="Your review" />
              <PanelBody className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="reviewer" className="label-mono">Your name</label>
                  <input id="reviewer" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mentor, Team lead" />
                </div>
                <ol className="space-y-3">
                  {decisions.map((d, i) => (
                    <li key={d.question} className="space-y-2 rounded-[6px] border border-line p-3" data-decision={i}>
                      <p className="label-mono">{d.question}</p>
                      <p className="text-[15px]">{d.answer}</p>
                      <div className="flex gap-2" role="radiogroup" aria-label={`Your stance on: ${d.question}`}>
                        {(["agree", "question"] as const).map((s) => (
                          <button key={s} type="button" role="radio" aria-checked={stances[i]?.stance === s}
                            onClick={() => setStances((x) => x.map((y, k) => (k === i ? { ...y, stance: s } : y)))}
                            className={cn("h-[34px] rounded-[6px] border px-3 text-[14px]", stances[i]?.stance === s ? (s === "agree" ? "border-ok text-ok" : "border-warn text-warn") : "border-line-2 text-fg-dim hover:text-fg")}>
                            {s === "agree" ? "✓ Agree" : "? Question it"}
                          </button>
                        ))}
                      </div>
                      {stances[i]?.stance === "question" && (
                        <textarea aria-label={`Comment on: ${d.question}`} rows={2} className="field" maxLength={600} value={stances[i].comment}
                          onChange={(e) => setStances((x) => x.map((y, k) => (k === i ? { ...y, comment: e.target.value } : y)))} placeholder="What would you change?" />
                      )}
                    </li>
                  ))}
                </ol>
                <fieldset className="space-y-2">
                  <legend className="label-mono mb-1">Overall</legend>
                  {VERDICTS.map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={verdict === x.id} onClick={() => setVerdict(x.id)} data-verdict={x.id}
                      className={cn("flex h-[40px] w-full items-center gap-2 rounded-[6px] border px-3 text-left text-[15px]", verdict === x.id ? x.tone : "border-line-2 text-fg-dim hover:text-fg")}>
                      <span aria-hidden="true">{x.icon}</span>{x.label}
                    </button>
                  ))}
                </fieldset>
                <div className="space-y-1">
                  <label htmlFor="review-note" className="label-mono">Note (optional)</label>
                  <textarea id="review-note" rows={3} className="field" maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Button variant="primary" className="w-full" onClick={makeReply} disabled={!verdict} data-testid="make-reply"><Send /> Create reply link</Button>
                {link && (
                  <div className="space-y-2" data-testid="reply">
                    <label htmlFor="reply-link" className="label-mono">Send this link back to the builder</label>
                    <textarea id="reply-link" readOnly rows={3} className="field font-mono text-[12px]" value={link} onFocus={(e) => e.currentTarget.select()} />
                    <Button size="sm" onClick={copy}><Copy /> Copy reply link</Button>
                  </div>
                )}
              </PanelBody>
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}
