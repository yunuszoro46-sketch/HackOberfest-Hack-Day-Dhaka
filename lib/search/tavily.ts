// Live web search through Tavily. Server-only; the key never reaches the browser.
export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export const searchConfigured = () => Boolean(process.env.TAVILY_API_KEY?.trim());

export async function tavilySearch(query: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetchImpl("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5, search_depth: "basic", include_answer: false }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Tavily search failed (HTTP ${res.status})`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .filter((r): r is Required<typeof r> => typeof r.url === "string" && /^https?:\/\//.test(r.url))
    .map((r) => ({ title: r.title ?? r.url, url: r.url, content: (r.content ?? "").slice(0, 600) }));
}
