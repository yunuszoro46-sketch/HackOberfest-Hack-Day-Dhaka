import type { IdeaCriterion } from '../../../shared/idea-report';
import type { MemberRoleId } from './schema';

export type CouncilRoleId = MemberRoleId | 'critic' | 'chair';

export interface CouncilRole {
  id: CouncilRoleId;
  title: string;
  /** Provider tried first for this role, to spread the council across models; the chain falls back as usual. */
  prefer: string;
  /** Criteria a member scores in its draft. Empty for critic and chair. */
  focus: IdeaCriterion[];
  brief: string;
}

export const COUNCIL_ROLES: Record<CouncilRoleId, CouncilRole> = {
  feasibility: {
    id: 'feasibility', title: 'Feasibility engineer', prefer: 'groq',
    focus: ['feasibility', 'technicalDepth', 'demoAbility'],
    brief: 'Judge whether this team can build a stable, demoable MVP in the hours left with the skills they have. Name the riskiest technical dependency.',
  },
  market: {
    id: 'market', title: 'Market and user analyst', prefer: 'openrouter',
    focus: ['problemClarity', 'impact', 'originality'],
    brief: 'Judge how real and frequent the problem is for the target user, what they use today, and whether this is differentiated from existing tools.',
  },
  judge: {
    id: 'judge', title: 'Hackathon judge', prefer: 'groq',
    focus: ['themeFit', 'demoAbility', 'originality', 'impact'],
    brief: 'Judge the idea as the target judges would in a short demo: theme fit, memorability, and the hard questions they would ask.',
  },
  critic: {
    id: 'critic', title: 'Critic', prefer: 'openrouter', focus: [],
    brief: 'Challenge the member drafts: flag inflated or unsupported scores, contradictions between members, and risks nobody mentioned.',
  },
  chair: {
    id: 'chair', title: 'Chair', prefer: 'gemini', focus: [],
    brief: 'Synthesise the drafts and the critique into one final assessment. Resolve disagreements explicitly and score all criteria.',
  },
};
