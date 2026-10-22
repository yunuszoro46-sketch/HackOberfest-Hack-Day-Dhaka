import type { StageId } from "./schema/ideaCard";

/** Display names for stages, shared by server-safe code (the client list lives in lib/client/stages.ts). */
const NAMES: Record<StageId, string> = { interrogate: "Idea", council: "Council", preview: "Preview", architecture: "Architecture", prompt: "Prompt", verify: "Verify" };
export const stageLabelOf = (s: StageId) => NAMES[s];
