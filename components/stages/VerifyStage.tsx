"use client";

import { useState } from "react";
import { ArrowRight, ClipboardCheck, FileText, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { EmptyState } from "@/components/console/StageStatus";
import { callStage } from "@/lib/client/api";
import { useIdea } from "@/lib/client/IdeaContext";
import { provenanceOf } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { acceptanceItems, type AcceptanceItem } from "@/lib/prompts/compile";
import { fixPrompt } from "@/lib/prompts/fix";
import { stamp } from "@/lib/stale";
import { CHECK_STATUSES, type BuildCheck, type CheckResult, type CheckStatus } from "@/lib/schema/ideaCard";
import { buildVerified, latestCheck, summarize } from "@/lib/verify";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

type Runner = ReturnType<typeof useStageRun>;

const STATUS_UI: Record<CheckStatus, { label: string; icon: string; tone: "ok" | "crit" | "warn" }> = {
  pass: { label: "pass", icon: "✓", tone: "ok" },
  fail: { label: "fail", icon: "✕", tone: "crit" },
  unknown: { label: "not confirmed", icon: "?", tone: "warn" },
};

const BY_LABEL: Record<CheckResult["by"], string> = { rules: "named in report", model: "matched by model", you: "set by you" };

/** A labelled sample report so the flow can be tried without running a coding agent. */
function sampleReport(items: AcceptanceItem[]): string {
  const lines = ["Build report (SAMPLE, written by TeamMate to show the format)", ""];
  items.forEach((a, i) => {
    if (i === 0) lines.push(`${a.id} PASS`);
    else if (i === 1) lines.push(`${a.id} FAIL — the primary action does nothing on click`);
    else if (i === items.length - 1 && items.length > 3) return;
    else if (a.endpoint) lines.push(`${a.endpoint.method} ${a.endpoint.path} works and returns the documented response`);
    else if (a.screen) lines.push(`${a.screen.title} screen works with seeded data`);
  });
  lines.push("", `Tests: ${Math.max(1, items.length - 2)} passed, 1 failed`);
  return lines.join("\n");
}

interface VerifyReply {
  results: CheckResult[];
  provider: string;
  model: string | null;
  warning: string | null;
}

export function VerifyStage({ runner, announce, onOpenPrompt }: { runner: Runner; announce: Announce; onOpenPrompt: () => void }) {
  const { card, update, latest } = useIdea();
  const [report, setReport] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  if (!card || !card.prompt) return null;
  const items = acceptanceItems(card);
  const check = latestCheck(card);
  const current = !!check && check.promptVersion === card.prompt.version;
  const sum = check ? summarize(check.results) : null;
  const verified = buildVerified(card);
  const busy = !!runner.running;

  const run = () =>
    runner.run("Verify · checking the build report", async () => {
      const c = latest()!;
      const res = await callStage<VerifyReply>("verify", { card: c, report });
      setWarning(res.warning);
      const entry: BuildCheck = {
        id: `check-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        promptVersion: c.prompt?.version ?? 1,
        report: report.slice(0, 20_000),
        results: res.results,
        provenance: res.provider === "rules" ? { kind: "rules", at: new Date().toISOString() } : provenanceOf({ provider: res.provider, model: res.model ?? undefined }),
      };
      update((x) => stamp({ ...x, buildChecks: [...x.buildChecks, entry].slice(-10) }, "verify"));
      const s = summarize(res.results);
      announce(`Build check: ${s.pass} passed, ${s.fail} failed, ${s.unknown} not confirmed.`);
    });

  const setStatus = (acId: string, status: CheckStatus) =>
    update((x) => {
      const last = x.buildChecks.at(-1);
      if (!last) return x;
      const results = last.results.map((r) => (r.acId === acId ? { ...r, status, by: "you" as const } : r));
      return { ...x, buildChecks: [...x.buildChecks.slice(0, -1), { ...last, results }] };
    });

  const writeFix = () => {
    if (!check || !card.prompt) return;
    const { target, markdown, version } = card.prompt;
    const { markdown: next } = fixPrompt(card, target, markdown, version, check);
    update((x) => stamp({ ...x, prompt: { target, markdown: next, version: version + 1 } }, "prompt"));
    announce(`Prompt v${version + 1} written for ${sum?.fail ?? 0} failed and ${sum?.unknown ?? 0} unconfirmed criteria.`);
    onOpenPrompt();
  };

  const needsFix = current && sum && (sum.fail > 0 || sum.unknown > 0);

  return (
    <div className="space-y-5" data-testid="verify-stage">
      <StageHeading eyebrow="Stage 06 · Verify" title="Did the build do what the plan said?"
        lead="Paste the coding agent's final report and test output. Each acceptance criterion is marked pass, fail or not confirmed, with the line that proves it. Then TeamMate writes the next prompt for what is left." />

      {verified && (
        <div className="lcd-display lcd-power-on flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[8px] px-4 py-3" data-testid="build-verified">
          <ClipboardCheck className="size-4 text-amber" aria-hidden="true" />
          <span className="font-mono text-[14px] font-medium uppercase tracking-[.1em] text-amber">Build verified · all {sum?.total} criteria pass</span>
          <span className="tabular ml-auto font-mono text-[12px] text-fg-dim">prompt v{card.prompt.version}</span>
        </div>
      )}

      {check && !current && (
        <section className="panel border-warn" role="status">
          <p className="pb text-[15px]"><span className="text-warn" aria-hidden="true">! </span><span className="font-medium">The last check was for prompt v{check.promptVersion}; the prompt is now v{card.prompt.version}.</span> <span className="text-fg-dim">Build with the new prompt, then paste the new report.</span></p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel aria-labelledby="report-h">
          <PanelHeader id="report-h" title="Build report" right={<span className="font-mono text-[12px] text-fg-faint">prompt v{card.prompt.version}</span>} />
          <PanelBody className="space-y-3">
            <label htmlFor="build-report" className="label-mono">Paste the agent&apos;s final message and the test output</label>
            <textarea id="build-report" rows={12} maxLength={20_000} className="field font-mono text-[14px]" value={report} onChange={(e) => setReport(e.target.value)}
              placeholder={"AC-01 PASS\nAC-02 FAIL — reason\n…\nTests: 4 passed, 1 failed"} />
            <div className="flex flex-wrap gap-2">
              <Button variant={needsFix ? "secondary" : "primary"} onClick={run} disabled={!report.trim() || busy || !items.length} data-testid="check-build"><ClipboardCheck /> Check the build</Button>
              <Button variant="ghost" onClick={() => setReport(sampleReport(items))} disabled={!items.length} data-testid="sample-report"><FileText /> Paste a sample report</Button>
            </div>
            {!items.length && <p className="text-[14px] text-crit">✕ This plan has no acceptance criteria yet. Generate a preview and an API surface first.</p>}
            {warning && <p className="text-[14px] text-warn" role="status">! {warning}</p>}
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="results-h" data-testid="check-results">
          <PanelHeader id="results-h" title={check ? "Results" : "Acceptance criteria"} right={check && <>
            {check.provenance && <ProvenanceBadge provenance={check.provenance} />}
            <Chip tone="ok" icon={<span aria-hidden="true">✓</span>}>{sum!.pass} pass</Chip>
            <Chip tone="crit" icon={<span aria-hidden="true">✕</span>}>{sum!.fail} fail</Chip>
            <Chip tone="warn" icon={<span aria-hidden="true">?</span>}>{sum!.unknown} not confirmed</Chip>
          </>} />
          <PanelBody>
            {check ? (
              <ul className="divide-y divide-[var(--line)]">
                {check.results.map((r) => (
                  <li key={r.acId} className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]" data-ac={r.acId} data-status={r.status}>
                    <span className="font-mono text-[14px] text-amber">{r.acId}</span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[15px]">{r.criterion}</p>
                      {r.evidence ? <p className="break-words font-mono text-[13px] text-fg-dim">“{r.evidence}”</p> : <p className="text-[13px] text-fg-faint">Nothing in the report mentions it.</p>}
                      <p className="font-mono text-[12px] text-fg-faint">{BY_LABEL[r.by]}</p>
                    </div>
                    <div className="flex items-start gap-2 sm:flex-col sm:items-end">
                      <Chip tone={STATUS_UI[r.status].tone} icon={<span aria-hidden="true">{STATUS_UI[r.status].icon}</span>}>{STATUS_UI[r.status].label}</Chip>
                      <label className="sr-only" htmlFor={`st-${r.acId}`}>Set {r.acId} status</label>
                      <select id={`st-${r.acId}`} className="field w-auto py-1 text-[14px]" value={r.status} onChange={(e) => setStatus(r.acId, e.target.value as CheckStatus)} disabled={!current}>
                        {CHECK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_UI[s].label}</option>)}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            ) : items.length ? (
              <ol className="space-y-2">
                {items.map((a) => <li key={a.id} className="flex gap-3 text-[15px]"><span className="font-mono text-[14px] text-amber">{a.id}</span><span>{a.text}</span></li>)}
              </ol>
            ) : <EmptyState text="No criteria to check yet." />}
          </PanelBody>
        </Panel>
      </div>

      {needsFix && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-[15px] text-fg-dim">{sum!.fail} failed and {sum!.unknown} not confirmed go first in the next prompt.</span>
          <Button variant="primary" onClick={writeFix} data-testid="write-fix"><PenLine /> Write prompt v{card.prompt.version + 1} for these <ArrowRight /></Button>
        </div>
      )}

      {card.buildChecks.length > 1 && (
        <Panel aria-labelledby="hist-h">
          <PanelHeader id="hist-h" title="Earlier checks" />
          <PanelBody>
            <ol className="space-y-1 font-mono text-[13px] text-fg-dim">
              {[...card.buildChecks].reverse().slice(1).map((c) => {
                const s = summarize(c.results);
                return <li key={c.id} className={cn("flex flex-wrap gap-x-3")}><span>prompt v{c.promptVersion}</span><span>{new Date(c.at).toLocaleString()}</span><span className="text-ok">✓ {s.pass}</span><span className="text-crit">✕ {s.fail}</span><span className="text-warn">? {s.unknown}</span></li>;
              })}
            </ol>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
