import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";

import { issueEdgeToken, hashEdgeToken } from "../src/core/edge/issueEdgeToken";

describe("issueEdgeToken", () => {
    test("plaintext starts with bsedge_", () => {
        const { plaintext } = issueEdgeToken();
        expect(plaintext.startsWith("bsedge_")).toBe(true);
    });

    test("plaintext carries 32 bytes of entropy (b64url ~43 chars after prefix)", () => {
        const { plaintext } = issueEdgeToken();
        const body = plaintext.slice("bsedge_".length);
        expect(body.length).toBeGreaterThanOrEqual(43);
        expect(body.length).toBeLessThanOrEqual(44);
        // base64url alphabet: [A-Za-z0-9_-]
        expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("two calls return distinct tokens", () => {
        const a = issueEdgeToken();
        const b = issueEdgeToken();
        expect(a.plaintext).not.toBe(b.plaintext);
        expect(a.hash).not.toBe(b.hash);
    });

    test("hash matches sha256(plaintext)", () => {
        const { plaintext, hash } = issueEdgeToken();
        const direct = createHash("sha256").update(plaintext).digest("hex");
        expect(hash).toBe(direct);
    });

    test("hashEdgeToken is deterministic", () => {
        expect(hashEdgeToken("bsedge_xyz")).toBe(hashEdgeToken("bsedge_xyz"));
    });
});
