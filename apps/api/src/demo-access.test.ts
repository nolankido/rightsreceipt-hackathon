import { describe, expect, it } from "vitest";
import { app } from "./index";

const creatorHeaders = { "x-rightsreceipt-demo-role": "creator" };

describe("temporary demo perimeter", () => {
  it("does not grant a public visitor creator access for a forged role header", async () => {
    const response = await app.request("https://rightsreceipt.workers.dev/api/creator/workspace", {
      headers: creatorHeaders,
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("creator_session_required");
  });

  it("allows the explicit header only in the local development fixture", async () => {
    const response = await app.request("http://local.test/api/creator/workspace", {
      headers: creatorHeaders,
    });
    expect(response.status).toBe(200);
  });

  it("does not allow a public origin to access fake receipt verification", async () => {
    const response = await app.request("https://rightsreceipt.workers.dev/api/mock/verify/" + "A".repeat(43));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("mock_mode_unavailable");
  });

  it("disables the creator header bypass for judge and sandbox environments", async () => {
    for (const mode of ["judge", "sandbox"] as const) {
      const response = await app.request("http://local.test/api/creator/workspace", {
        headers: creatorHeaders,
      }, { APP_MODE: mode });
      expect(response.status).toBe(403);
    }
  });
});
