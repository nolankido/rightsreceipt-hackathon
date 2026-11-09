export interface SafeLogContextInput {
  readonly correlationId?: string;
  readonly event: string;
}

export interface SafeLogContext {
  readonly correlation_id: string | null;
  readonly event: string;
}

export function createSafeLogContext(input: SafeLogContextInput): SafeLogContext {
  return {
    correlation_id: input.correlationId?.slice(0, 128) ?? null,
    event: input.event,
  };
}
