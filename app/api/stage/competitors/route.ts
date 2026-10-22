import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate, getProvider } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { CompetitorOutputSchema, competitorQueries, competitorsPrompt } from "@/lib/prompts/competitors";
import { IdeaCardSchema, type Competitor, type IdeaCard } from "@/lib/schema/ideaCard";
import { searchConfigured, tavilySearch, type SearchResult } from "@/lib/search/tavily";
import { runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Stage 2B: three live searches (Tavily) summarised into 3-5 competitors. URLs are copied from search results by
 * index, never typed by the model. Without search: Gemini's Google Search grounding when LLM_PROVIDER=gemini,
 * otherwise a labelled "model-knowledge" list with no URLs.
 */
export async function POST(req: NextRequest) {
  return runStage(req, z.object({ card: IdeaCardSchema }), async ({ card }, signal) => {
    const queries = competitorQueries(card);
    let results: SearchResult[] | null = null;
    let warning: string | null = null;
    if (searchConfigured()) {
      try {
        const batches = await Promise.all(queries.map((q) => tavilySearch(q, signal)));
        const seen = new Set<string>();
        results = batches.flat().filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 12);
        if (results.length === 0) {
          results = null;
          warning = "Live search returned no results.";
        }
      } catch (err) {
        warning = `Live search failed: ${(err as Error).message}.`;
      }
    } else {
      warning = "No live search is configured (TAVILY_API_KEY).";
    }

    const provider = getProvider();
    const grounded = !results && provider.supportsSearch;
    const { system, user } = competitorsPrompt(card, results);
    const out = await generate({
      stage: "competitors", system, schema: CompetitorOutputSchema, signal, search: grounded,
      user: grounded ? `${user}\nYou may search the web. Add "url": the product's official homepage, only if your search found it.` : user,
    });

    const groundedHosts = new Set(out.groundingSources.map((s) => host(s.title.includes(".") ? `https://${s.title}` : s.uri)).filter(Boolean));
    const competitors: Competitor[] = out.data.competitors.map((c) => {
      const fromResult = results && c.result ? results[c.result - 1] : undefined;
      if (fromResult) return { name: c.name, url: fromResult.url, whatTheySolve: c.whatTheySolve, gap: c.gap, source: "tavily" };
      const claimed = (c as { url?: unknown }).url;
      if (grounded && typeof claimed === "string" && groundedHosts.has(host(claimed))) {
        return { name: c.name, url: claimed, whatTheySolve: c.whatTheySolve, gap: c.gap, source: "google-search" };
      }
      return { name: c.name, url: "", whatTheySolve: c.whatTheySolve, gap: c.gap, source: "model-knowledge" };
    });
    const mode: NonNullable<IdeaCard["competitorSearch"]>["mode"] = results ? "tavily" : grounded && competitors.some((c) => c.source === "google-search") ? "google-search" : "none";
    const keepUser = card.competitors.filter((c) => c.source === "user");
    return {
      patch: { competitors: [...competitors, ...keepUser].slice(0, 8), competitorSearch: { mode, queries, ranAt: new Date().toISOString() } },
      warning: mode === "none" ? `${warning ?? ""} Competitors below come from the model's own knowledge and have no links; verify them yourself.`.trim() : null,
      provider: out.provider,
      model: out.model,
    };
  });
}
