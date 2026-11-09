/** Bundled, version-locked, read-only model diagnostics. Never a rights resolver. */
import {
  inspectLearnedRanking, loadVerifiedPortableModel, verifySelectiveMarginPolicy,
  type PortableRightsModel, type SelectiveMarginPolicy,
} from "@rightsreceipt/ai-runtime";
import type { LearnedDiagnosticPort } from "@rightsreceipt/application";
import artifactRaw from "../../../data/model/v1/artifact.json?raw";
import policyRaw from "../../../data/model/v1/validation-margin-gates.json?raw";

const EXPECTED_ARTIFACT_SHA256 = "6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2";
const EXPECTED_VALIDATION_SHA256 = "cf8a710db4210f3e9c11dd92a9c875ea487488f521d08c46477b4ed8a4bddb95";
let cached: Promise<{ model: PortableRightsModel; policy: SelectiveMarginPolicy }> | null = null;
function verifiedAssets() {
  if (!cached) cached = (async () => {
    const model = await loadVerifiedPortableModel(artifactRaw, EXPECTED_ARTIFACT_SHA256);
    const policy = verifySelectiveMarginPolicy(
      JSON.parse(policyRaw) as unknown,
      EXPECTED_ARTIFACT_SHA256, EXPECTED_VALIDATION_SHA256,
    );
    return {model,policy};
  })();
  return cached;
}
export const localLearnedDiagnostic: LearnedDiagnosticPort = {
  async inspect(originalText) {
    const { model, policy } = await verifiedAssets();
    const ranking = model.predict(originalText);
    const assessment = inspectLearnedRanking(ranking, policy);
    return {
      modelId: ranking.modelId, modelVersion: ranking.modelVersion,
      artifactSha256: ranking.artifactSha256, assessment,
    };
  },
};
