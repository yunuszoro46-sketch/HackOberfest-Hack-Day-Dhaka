import type { ApiErrorCode } from '../../../shared/types';

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  NO_AGENTS: 409,
  STALE: 409,
  EMPTY_PLAN: 422,
  INTERNAL: 500,
};

export class ApiErr extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what: string) => new ApiErr('NOT_FOUND', `${what} not found`);
