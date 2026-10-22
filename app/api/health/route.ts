import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/adapter";

export const dynamic = "force-dynamic";

/** Which model and search are in play. Never returns keys. */
export function GET() {
  const p = getProvider();
  const tavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  return NextResponse.json({
    ok: true,
    provider: p.name,
    model: p.model,
    providerConfigured: p.configured,
    search: {
      configured: tavily || p.supportsSearch,
      provider: tavily ? "tavily" : p.supportsSearch ? "google-search" : null,
    },
  });
}
