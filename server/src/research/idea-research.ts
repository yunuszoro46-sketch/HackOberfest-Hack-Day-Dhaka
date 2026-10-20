import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IdeaInput } from '../../../shared/idea-report';
import type {
  IdeaReference, IdeaResearchResult, ResearchProvider, ResearchProviderStatus, ResearchSimilarity,
  UnreachableReference,
} from '../../../shared/idea-research';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESULT_LIMIT = 5;
const REQUEST_TIMEOUT_MS = 6000;
const GITHUB_URL = 'https://api.github.com/search/repositories';
const YOUTUBE_URL = 'https://www.googleapis.com/youtube/v3/search';

const GitHubResponse = z.object({
  items: z.array(z.object({
    full_name: z.string().max(200),
    description: z.string().max(1000).nullable().optional(),
    html_url: z.string().url().max(2048),
    language: z.string().max(100).nullable().optional(),
    stargazers_count: z.number().int().nonnegative(),
  })),
});
const YouTubeResponse = z.object({
  items: z.array(z.object({
    id: z.object({ videoId: z.string().min(1).max(100) }),
    snippet: z.object({ title: z.string().min(1).max(250), channelTitle: z.string().max(250).optional() }),
  })),
});

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface CacheEntry {
  expiresAt: number;
  result: IdeaResearchResult;
}

export interface IdeaResearchService {
  research(input: IdeaInput): Promise<IdeaResearchResult>;
}

export interface ResearchOptions {
  fetchImpl?: FetchLike;
  youtubeApiKey?: string;
  now?: () => number;
}

function searchTerms(input: IdeaInput): string {
  return [input.idea, input.theme]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function cacheKey(input: IdeaInput): string {
  const normalized = [input.idea, input.theme ?? ''].map((part) => part.trim().toLowerCase()).join('\n');
  return createHash('sha256').update(normalized).digest('hex');
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function similarity(input: string, reference: string): ResearchSimilarity {
  const expected = tokenSet(input);
  const actual = tokenSet(reference);
  if (!expected.size || !actual.size) return 'low';
  let shared = 0;
  for (const token of expected) if (actual.has(token)) shared++;
  const ratio = shared / Math.min(expected.size, actual.size);
  return ratio >= 0.55 ? 'high' : ratio >= 0.25 ? 'medium' : 'low';
}

function ownSummary(provider: ResearchProvider, language?: string | null, stars?: number): string {
  if (provider === 'github') {
    const details = [language, stars !== undefined ? `${stars.toLocaleString()} stars` : null].filter(Boolean).join(', ');
    return `A GitHub project${details ? ` (${details})` : ''} that may offer a useful implementation comparison.`;
  }
  return 'A YouTube video reference; review it for product context and practical lessons.';
}

function learning(similar: ResearchSimilarity): string {
  if (similar === 'high') return 'Compare its target users and core workflow; identify what to improve rather than copying its approach.';
  if (similar === 'medium') return 'Look for reusable patterns, then check whether the user need and constraints differ.';
  return 'Use as adjacent inspiration only; verify relevance before applying its ideas.';
}

function isAllowedSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname === 'www.youtube.com');
  } catch {
    return false;
  }
}

async function verifyUrl(fetchImpl: FetchLike, rawUrl: string): Promise<string | null> {
  if (!isAllowedSourceUrl(rawUrl)) return 'The source URL is not on an approved research domain.';
  try {
    const response = await fetchImpl(rawUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return `Link check returned HTTP ${response.status}.`;
    return null;
  } catch (error) {
    return error instanceof Error ? `Link check failed: ${error.message}` : 'Link check failed.';
  }
}

function providerStatus(
  provider: ResearchProvider,
  status: ResearchProviderStatus['status'],
  message: string,
  resultCount = 0,
): ResearchProviderStatus {
  return { provider, status, message, resultCount };
}

export function createIdeaResearchService(options: ResearchOptions = {}): IdeaResearchService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const youtubeApiKey = options.youtubeApiKey ?? process.env.YOUTUBE_DATA_API_KEY;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<IdeaResearchResult>>();

  async function searchGitHub(query: string, idea: string): Promise<{ references: IdeaReference[]; status: ResearchProviderStatus }> {
    try {
      const url = new URL(GITHUB_URL);
      url.searchParams.set('q', `${query} in:name,description,readme`);
      url.searchParams.set('sort', 'stars');
      url.searchParams.set('order', 'desc');
      url.searchParams.set('per_page', String(RESULT_LIMIT));
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'IdeaMate-Hackathon-Research' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { references: [], status: providerStatus('github', 'failed', `GitHub Search API returned HTTP ${response.status}.`) };
      }
      const parsed = GitHubResponse.safeParse(await response.json());
      if (!parsed.success) {
        return { references: [], status: providerStatus('github', 'failed', 'GitHub Search API returned an unexpected response format.') };
      }
      const references = parsed.data.items.flatMap((item) => {
        if (!isAllowedSourceUrl(item.html_url)) return [];
        return [{
          provider: 'github' as const,
          title: item.full_name,
          url: item.html_url,
          summary: ownSummary('github', item.language, item.stargazers_count),
          similarity: similarity(idea, `${item.full_name} ${item.description ?? ''}`),
          learning: learning(similarity(idea, `${item.full_name} ${item.description ?? ''}`)),
        }];
      });
      return {
        references,
        status: providerStatus('github', 'complete', 'Searched GitHub repositories using the official GitHub Search API.', references.length),
      };
    } catch (error) {
      return {
        references: [],
        status: providerStatus('github', 'failed', error instanceof Error ? `GitHub research failed: ${error.message}` : 'GitHub research failed.'),
      };
    }
  }

  async function searchYouTube(query: string, idea: string): Promise<{ references: IdeaReference[]; status: ResearchProviderStatus }> {
    if (!youtubeApiKey) {
      return {
        references: [],
        status: providerStatus('youtube', 'unavailable', 'YouTube research is disabled because YOUTUBE_DATA_API_KEY is not configured.'),
      };
    }
    try {
      const url = new URL(YOUTUBE_URL);
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'video');
      url.searchParams.set('maxResults', String(RESULT_LIMIT));
      url.searchParams.set('q', query);
      url.searchParams.set('key', youtubeApiKey);
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        return { references: [], status: providerStatus('youtube', 'failed', `YouTube Data API returned HTTP ${response.status}.`) };
      }
      const parsed = YouTubeResponse.safeParse(await response.json());
      if (!parsed.success) {
        return { references: [], status: providerStatus('youtube', 'failed', 'YouTube Data API returned an unexpected response format.') };
      }
      const references = parsed.data.items.map((item) => {
        const title = item.snippet.title;
        const score = similarity(idea, title);
        return {
          provider: 'youtube' as const,
          title,
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id.videoId)}`,
          summary: ownSummary('youtube'),
          similarity: score,
          learning: learning(score),
        };
      }).filter((reference) => isAllowedSourceUrl(reference.url));
      return {
        references,
        status: providerStatus('youtube', 'complete', 'Searched videos using the official YouTube Data API.', references.length),
      };
    } catch (error) {
      return {
        references: [],
        status: providerStatus('youtube', 'failed', error instanceof Error ? `YouTube research failed: ${error.message}` : 'YouTube research failed.'),
      };
    }
  }

  async function runResearch(input: IdeaInput): Promise<IdeaResearchResult> {
    const query = searchTerms(input);
    const [github, youtube] = await Promise.all([
      searchGitHub(query, input.idea),
      searchYouTube(query, input.idea),
    ]);
    const candidates = [...github.references, ...youtube.references];
    const reachability = await Promise.all(candidates.map(async (reference) => ({
      reference,
      reason: await verifyUrl(fetchImpl, reference.url),
    })));
    const references = reachability.flatMap(({ reference, reason }) => reason ? [] : [reference]);
    const unreachable: UnreachableReference[] = reachability.flatMap(({ reference, reason }) => reason ? [{ url: reference.url, reason }] : []);
    const statuses = [github.status, youtube.status].map((status) => {
      if (status.status !== 'complete') return status;
      const reachableCount = references.filter((reference) => reference.provider === status.provider).length;
      return { ...status, resultCount: reachableCount };
    });
    const successfulProviders = statuses.filter((status) => status.status === 'complete').length;
    const status: IdeaResearchResult['status'] = references.length === 0
      ? 'unavailable'
      : successfulProviders === statuses.length ? 'complete' : 'partial';
    return {
      status,
      cached: false,
      completedAt: new Date(now()).toISOString(),
      references,
      providers: statuses,
      unreachable,
    };
  }

  return {
    async research(input) {
      const key = cacheKey(input);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return { ...cached.result, cached: true };
      const active = inFlight.get(key);
      if (active) return { ...(await active), cached: true };

      const pending = runResearch(input);
      inFlight.set(key, pending);
      try {
        const result = await pending;
        cache.set(key, { result, expiresAt: now() + CACHE_TTL_MS });
        return result;
      } finally {
        inFlight.delete(key);
      }
    },
  };
}
