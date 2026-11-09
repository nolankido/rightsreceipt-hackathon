export * from "./contract";
export * from "./deterministic";
export * from "./deterministic-rules";
export * from "./portable-model";
export * from "./calibration";
export * from "./observation-bridge";
export * from "./clarification";

export interface InferenceContract {
  readonly artifactVersion: string;
  readonly inputText: string;
}

export const AI_RUNTIME_PACKAGE_STATUS = "learned-model-reviewed-not-approved" as const;
