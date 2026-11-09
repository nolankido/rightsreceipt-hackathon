export type ScaffoldRole = "public" | "judge" | "creator" | "buyer" | "verifier";

export interface ScaffoldRoute {
  path: string;
  label: string;
  role: ScaffoldRole;
  purpose: string;
}

export const scaffoldRoutes: readonly ScaffoldRoute[] = [
  {
    path: "/",
    label: "Overview",
    role: "public",
    purpose: "Explain the product problem and authority boundaries.",
  },
  {
    path: "/judge",
    label: "Judge walkthrough",
    role: "judge",
    purpose: "Open the self-contained illustrative walkthrough without credentials.",
  },
  {
    path: "/creator",
    label: "Creator (local)",
    role: "creator",
    purpose: "View assets, submitted requests, and structured rights review work.",
  },
  {
    path: "/buyer/demo",
    label: "Buyer demo (local)",
    role: "buyer",
    purpose: "Create a fresh asset-bound demo capability and open buyer intake.",
  },
  {
    path: "/verify/demo",
    label: "Simulated verifier",
    role: "verifier",
    purpose: "Reserve the privacy-minimized verification surface.",
  },
] as const;

export const creatorAssetRoutes = Object.freeze({
  new: "/creator/assets/new",
  detail: "/creator/assets/:assetId",
});

export const creatorTermsRoutes = Object.freeze({
  list: "/creator/cases",
  review: "/creator/cases/:caseId",
});

export const buyerRequestRoutePattern = "/request/:capability" as const;

export function routeFor(path: string) {
  return scaffoldRoutes.find((route) => route.path === path);
}
