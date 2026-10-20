import { describe, expect, it, vi } from 'vitest';
import { createIdeaResearchService, type IdeaResearchService } from '../src/research/idea-research';
import { makeApp } from './helpers';

const input = {
  idea: 'A mobile app that helps Dhaka commuters find safe parking.',
  theme: 'local problems',
  hoursLeft: 150,
  teamSkills: 'React and Node',
};

describe('official idea research', () => {
  it('uses GitHub Search API, verifies returned links, and caches results', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const parsedUrl = new URL(url);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      expect(parsedUrl.origin).toBe('https://api.github.com');
      expect(parsedUrl.pathname).toBe('/search/repositories');
      return Response.json({
        items: [{
          full_name: 'example/parking-map',
          description: 'A map for commuters to find parking',
          html_url: 'https://github.com/example/parking-map',
          language: 'TypeScript',
          stargazers_count: 12,
        }],
      });
    });
    const service = createIdeaResearchService({ fetchImpl, youtubeApiKey: '', now: () => 1_800_000_000_000 });

    const first = await service.research(input);
    const second = await service.research(input);

    expect(first.status).toBe('partial');
    expect(first.references).toHaveLength(1);
    expect(first.references[0].url).toBe('https://github.com/example/parking-map');
    expect(first.references[0].summary).not.toContain('A map for commuters');
    expect(first.providers.find((provider) => provider.provider === 'youtube')?.status).toBe('unavailable');
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports unreachable links instead of including them as verified references', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      return Response.json({
        items: [{
          full_name: 'example/deleted-project',
          description: 'A related project',
          html_url: 'https://github.com/example/deleted-project',
          language: null,
          stargazers_count: 0,
        }],
      });
    });
    const service = createIdeaResearchService({ fetchImpl, youtubeApiKey: '' });
    const result = await service.research(input);

    expect(result.status).toBe('unavailable');
    expect(result.references).toHaveLength(0);
    expect(result.unreachable).toEqual([{
      url: 'https://github.com/example/deleted-project',
      reason: 'Link check returned HTTP 404.',
    }]);
  });

  it('requires explicit confirmation before starting the research request', async () => {
    const service: IdeaResearchService = {
      research: vi.fn<IdeaResearchService['research']>(async () => ({
        status: 'unavailable',
        cached: false,
        completedAt: new Date(0).toISOString(),
        references: [],
        providers: [],
        unreachable: [],
      })),
    };
    const { http } = makeApp({ researchService: service });
    const rejected = await http.post('/api/ideas/research').send({ ...input });

    expect(rejected.status).toBe(400);
    expect(service.research).not.toHaveBeenCalled();

    const accepted = await http.post('/api/ideas/research').send({ ...input, confirmed: true });
    expect(accepted.status).toBe(200);
    expect(service.research).toHaveBeenCalledOnce();
  });
});
