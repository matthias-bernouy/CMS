import { describe, test, expect } from "bun:test";
import { generateBearerToken } from "src/credentials/generateBearerToken";

describe("generateBearerToken", () => {
    test("preserves the prefix verbatim", () => {
        expect(generateBearerToken("bsp_")).toMatch(/^bsp_/);
        expect(generateBearerToken("mtc_")).toMatch(/^mtc_/);
        expect(generateBearerToken("")).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("emits a base64url body (no +, /, = chars)", () => {
        const token = generateBearerToken("x_");
        const body  = token.slice(2);
        expect(body).not.toMatch(/[+/=]/);
        expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("body is 43 chars (32 bytes base64url unpadded)", () => {
        // 32 bytes → ceil(32 * 4 / 3) = 43 chars after stripping `=` padding.
        const body = generateBearerToken("p_").slice(2);
        expect(body.length).toBe(43);
    });

    test("emits unique tokens (no collision over 100 calls)", () => {
        const set = new Set<string>();
        for (let i = 0; i < 100; i++) set.add(generateBearerToken("u_"));
        expect(set.size).toBe(100);
    });
});
