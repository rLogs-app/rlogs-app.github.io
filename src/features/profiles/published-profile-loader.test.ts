import { describe, expect, it } from "vitest";

import { profileSourceProtocolPackDigest } from "./published-profile-loader";

describe("published profile runtime identity", () => {
  it("preserves a valid protocol digest and fails closed for legacy or malformed values", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(profileSourceProtocolPackDigest({ source_protocol_pack_digest: digest })).toBe(digest);
    expect(profileSourceProtocolPackDigest({})).toBeUndefined();
    expect(profileSourceProtocolPackDigest({ source_protocol_pack_digest: "sha256:wrong" })).toBeUndefined();
  });
});
