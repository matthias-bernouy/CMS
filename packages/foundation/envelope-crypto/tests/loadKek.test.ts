import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { loadKek } from "@bernouy/envelope-crypto";

describe("loadKek", () => {
    test("decodes a base64 32-byte KEK", () => {
        const kek = randomBytes(32);
        expect(loadKek(kek.toString("base64")).equals(kek)).toBe(true);
    });

    test("fails fast on a missing value, naming the env var", () => {
        expect(() => loadKek(undefined, "CMS_KEK")).toThrow("CMS_KEK");
        expect(() => loadKek("", "CMS_KEK")).toThrow("openssl rand");
    });

    test("rejects a value that does not decode to exactly 32 bytes", () => {
        expect(() => loadKek(randomBytes(16).toString("base64"))).toThrow("32 bytes");
        expect(() => loadKek("not base64 at all!!")).toThrow();
    });
});
