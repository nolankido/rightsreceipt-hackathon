import {
  AI_TASK_CONTRACT_VERSION,
  assessAiExtraction,
  type AiExtractionAssessment,
  type AiExtractionProposal,
} from "./contract";
import {
  DETERMINISTIC_EXTRACTOR_VERSION,
  extractDeterministicFields,
} from "./deterministic-rules";

export interface DeterministicHashPort {
  sha256Hex(value: string): Promise<string>;
}

/** Prepare a strict proposal bound to the unmodified original buyer input. */
export function buildDeterministicRightsProposal(
  originalText: string,
  inputSha256: string,
): AiExtractionProposal {
  return {
    contractVersion: AI_TASK_CONTRACT_VERSION,
    inputSha256,
    extractor: {
      kind: "deterministic",
      extractorVersion: DETERMINISTIC_EXTRACTOR_VERSION,
      modelId: null,
      modelVersion: null,
      artifactSha256: null,
    },
    fields: extractDeterministicFields(originalText),
  };
}

/** The assessment never grants permission, creates a quote, or claims AI calibration. */
export async function assessDeterministicRights(
  originalText: string,
  hasher: DeterministicHashPort,
): Promise<AiExtractionAssessment> {
  const inputSha256 = await hasher.sha256Hex(originalText);
  return assessAiExtraction(
    buildDeterministicRightsProposal(originalText, inputSha256),
    originalText,
    inputSha256,
  );
}
