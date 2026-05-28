import { describe, test, expect } from "bun:test";
import { resolveSecretRefs } from "cms-control/core/secrets/resolveSecretRefs";
import { SecretNotFound } from "cms-control/errors/SecretNotFound";
import { InMemorySecretStore } from "@bernouy/cms-shared";

async function makeStore(entries: Record<string, string>) {
    const s = new InMemorySecretStore();
    for (const [k, v] of Object.entries(entries)) await s.set(k, v);
    return s;
}

describe("resolveSecretRefs", () => {

    test("no-op on a string without any ${} pattern", async () => {
        const s = await makeStore({});
        expect(await resolveSecretRefs("plain text", s)).toBe("plain text");
        expect(await resolveSecretRefs("", s)).toBe("");
    });

    test("substitutes a single reference", async () => {
        const s = await makeStore({ HUB_API_TOKEN: "abc123" });
        expect(await resolveSecretRefs("${HUB_API_TOKEN}", s)).toBe("abc123");
    });

    test("substitutes a reference embedded in surrounding text", async () => {
        const s = await makeStore({ HUB_API_TOKEN: "abc" });
        expect(await resolveSecretRefs("Bearer ${HUB_API_TOKEN}", s)).toBe("Bearer abc");
    });

    test("substitutes multiple distinct references in one string", async () => {
        const s = await makeStore({ USER: "alice", PASS: "p4ss" });
        expect(await resolveSecretRefs("https://${USER}:${PASS}@host", s))
            .toBe("https://alice:p4ss@host");
    });

    test("substitutes repeated references via the cache (single store hit)", async () => {
        const s = await makeStore({ KEY: "v" });
        let calls = 0;
        const tracked = { ...s, get: async (k: string) => { calls++; return s.get(k); } } as typeof s;
        expect(await resolveSecretRefs("${KEY}-${KEY}-${KEY}", tracked)).toBe("v-v-v");
        expect(calls).toBe(1);
    });

    test("throws SecretNotFound when a referenced key is missing", async () => {
        const s = await makeStore({ A: "1" });
        await expect(resolveSecretRefs("Bearer ${MISSING}", s)).rejects.toBeInstanceOf(SecretNotFound);
    });

    test("error carries the missing key for callers to surface", async () => {
        const s = await makeStore({});
        try {
            await resolveSecretRefs("${TYPO}", s);
            throw new Error("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(SecretNotFound);
            expect((e as SecretNotFound).key).toBe("TYPO");
        }
    });

    test("ignores patterns that don't match the strict key regex", async () => {
        // Lowercase, hyphens, leading digit, empty — none should be considered refs
        const s = await makeStore({ A: "x" });
        expect(await resolveSecretRefs("${lowercase}",  s)).toBe("${lowercase}");
        expect(await resolveSecretRefs("${KEY-WITH-DASH}", s)).toBe("${KEY-WITH-DASH}");
        expect(await resolveSecretRefs("${1LEADING_DIGIT}", s)).toBe("${1LEADING_DIGIT}");
        expect(await resolveSecretRefs("${}", s)).toBe("${}");
    });

    test("an empty stored value substitutes to empty string", async () => {
        const s = await makeStore({ EMPTY: "" });
        expect(await resolveSecretRefs("[${EMPTY}]", s)).toBe("[]");
    });
});
