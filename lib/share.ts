// Share for review without a server: the card is compressed into the URL fragment (#…), which browsers never send
// to the server. The reviewer's reply comes back the same way. Everything decoded is validated with Zod.
import { IdeaCardSchema, ReviewSchema, type IdeaCard, type Review } from "./schema/ideaCard";

const PREFIX = "v1.";
const MAX_BYTES = 1_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pump(stream: ReadableStream<Uint8Array>, limit = MAX_BYTES): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("The shared data is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function pack(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const zipped = await pump(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")), Infinity);
  return PREFIX + toBase64Url(zipped);
}

export async function unpack(s: string): Promise<unknown> {
  if (!s.startsWith(PREFIX)) throw new Error("This link is not a TeamMate share link.");
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64Url(s.slice(PREFIX.length));
  } catch {
    throw new Error("This link is damaged (it may have been cut short).");
  }
  try {
    const bytes = await pump(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error((e as Error).message === "The shared data is too large." ? (e as Error).message : "This link is damaged (it may have been cut short).");
  }
}

/** What a reviewer needs: the chosen direction's preview only; build reports shortened. */
export function slimForShare(card: IdeaCard): IdeaCard {
  return {
    ...card,
    directions: card.directions.map((d) => (d.id === card.chosenDirectionId ? d : { ...d, previewHtml: undefined })),
    buildChecks: card.buildChecks.map((c) => ({ ...c, report: c.report.slice(0, 2000) })),
  };
}

export async function shareLink(origin: string, card: IdeaCard): Promise<string> {
  return `${origin}/review#card=${await pack(slimForShare(card))}`;
}

export async function readSharedCard(hash: string): Promise<IdeaCard> {
  const m = /^#card=(.+)$/.exec(hash);
  if (!m) throw new Error("No shared idea in this link.");
  const parsed = IdeaCardSchema.safeParse(await unpack(m[1]));
  if (!parsed.success) throw new Error("The shared idea is not valid.");
  return parsed.data;
}

export async function reviewLink(origin: string, ideaId: string, review: Review): Promise<string> {
  return `${origin}/idea/${encodeURIComponent(ideaId)}#review=${await pack(review)}`;
}

export async function readReview(hash: string): Promise<Review | null> {
  const m = /^#review=(.+)$/.exec(hash);
  if (!m) return null;
  const parsed = ReviewSchema.safeParse(await unpack(m[1]));
  if (!parsed.success) throw new Error("The review in this link is not valid.");
  return parsed.data;
}
