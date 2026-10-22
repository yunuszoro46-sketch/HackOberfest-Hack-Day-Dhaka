// Shared plumbing for every /api/stage/<name> route: rate limit, body validation, and errors the UI can show
// (message + raw model text in a collapsible panel), never a blank screen.
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { LlmError } from "../llm/types";
import { rateLimit } from "./rateLimit";

export interface StageErrorBody {
  error: string;
  /** Raw model output, when the model replied but the reply was unusable. */
  raw?: string;
  detail?: string;
}

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

export async function runStage<B, R>(req: NextRequest, bodySchema: z.ZodType<B, z.ZodTypeDef, unknown>, fn: (body: B, signal: AbortSignal) => Promise<R>) {
  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json<StageErrorBody>({ error: `Rate limit reached (30 requests per 10 minutes). Try again in ${limit.retryAfterSec}s.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }
  let body: B;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Body is not JSON";
    return NextResponse.json<StageErrorBody>({ error: "The request was not a valid Idea Card.", detail }, { status: 400 });
  }
  try {
    return NextResponse.json(await fn(body, req.signal));
  } catch (err) {
    if (err instanceof LlmError) return NextResponse.json<StageErrorBody>({ error: err.message, raw: err.raw, detail: err.detail }, { status: err.status });
    console.error(err);
    return NextResponse.json<StageErrorBody>({ error: `Unexpected server error: ${(err as Error).message}` }, { status: 500 });
  }
}

/** Fresh lockable value for a generated field. */
export const generated = <T>(value: T) => ({ value, locked: false, generatedAt: new Date().toISOString() });
