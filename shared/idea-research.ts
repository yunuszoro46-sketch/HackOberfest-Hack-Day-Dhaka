export type ResearchProvider = 'github' | 'youtube';
export type ResearchSimilarity = 'high' | 'medium' | 'low';

export interface IdeaReference {
  provider: ResearchProvider;
  title: string;
  url: string;
  summary: string;
  similarity: ResearchSimilarity;
  learning: string;
}

export interface ResearchProviderStatus {
  provider: ResearchProvider;
  status: 'complete' | 'unavailable' | 'failed';
  message: string;
  resultCount: number;
}

export interface UnreachableReference {
  url: string;
  reason: string;
}

export interface IdeaResearchResult {
  status: 'complete' | 'partial' | 'unavailable';
  cached: boolean;
  completedAt: string;
  references: IdeaReference[];
  providers: ResearchProviderStatus[];
  unreachable: UnreachableReference[];
}
