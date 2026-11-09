export interface ClockPort {
  now(): Date;
  todayUtc(): string;
}

export interface IdentifierPort {
  create(): string;
}

export interface UnitOfWorkPort {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export * from "./assets";
export * from "./buyer-requests";
export * from "./rights-terms";
export * from "./quotes";
export * from "./mock-transaction";
export * from "./ai-extraction";
export * from "./clarification";

export const APPLICATION_PACKAGE_STATUS = "structured-rights-review" as const;
