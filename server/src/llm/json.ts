import type { z } from 'zod';
import { LlmError } from './types';

/** Strip ``` fences and return the first balanced {...} block (string-aware), parsed. */
export function parseLooseJson(text: string): unknown {
  const s = text.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  if (start === -1) throw new Error('no JSON object in model output');
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object in model output');
}

/** Parse a model reply and validate it, mapping failures to BAD_JSON / SCHEMA. */
export function validateReply<T>(provider: string, text: string, schema: z.ZodType<T, any, any>): T {
  let raw: unknown;
  try {
    raw = parseLooseJson(text);
  } catch {
    throw new LlmError(provider, 'BAD_JSON', 'no parseable JSON object in the model reply');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new LlmError(provider, 'SCHEMA', parsed.error.issues[0]?.message ?? 'reply did not match the schema');
  return parsed.data;
}
