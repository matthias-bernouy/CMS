import { describe, test, expect } from "bun:test";
import {
    InMemorySecretStore,
    SECRET_KEY_MAX_LENGTH,
    SecretValidationError,
    ValidatingSecretStore,
    isValidSecretKey,
    secretKeyToRef,
    secretRefToKey,
    secretRefGlobalPattern,
} from "@bernouy/cms-secrets";

describe("ValidatingSecretStore", () => {
    test("accepts an env-var-style key and delegates", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        await store.set("STRIPE_KEY", "sk_live");
        expect(await store.get("STRIPE_KEY")).toBe("sk_live");
    });

    test("rejects malformed keys", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        for (const bad of ["lowercase", "1LEADING", "WITH-DASH", "", "A".repeat(SECRET_KEY_MAX_LENGTH + 1)]) {
            await expect(store.set(bad, "v")).rejects.toThrow(SecretValidationError);
        }
    });

    test("an empty value is allowed (clear without delete)", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        await store.set("API_KEY", "");
        expect(await store.get("API_KEY")).toBe("");
    });

    test("reads/deletes/lists pass through", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        await store.set("A", "1");
        await store.delete("A");
        expect(await store.get("A")).toBeNull();
        expect(await store.listKeys()).toEqual([]);
    });
});

describe("secret refs", () => {
    test("formats and parses exact refs", () => {
        expect(secretKeyToRef("API_KEY")).toBe("${API_KEY}");
        expect(secretRefToKey("${API_KEY}")).toBe("API_KEY");
        expect(secretRefToKey("Bearer ${API_KEY}")).toBeNull();
    });

    test("global ref pattern factory returns fresh regexes", () => {
        const a = secretRefGlobalPattern();
        const b = secretRefGlobalPattern();
        expect(a).not.toBe(b);
        expect(a.test("${API_KEY}")).toBe(true);
        expect(a.lastIndex).toBeGreaterThan(0);
        expect(b.lastIndex).toBe(0);
    });

    test("key predicate mirrors the validating store rule", () => {
        expect(isValidSecretKey("API_KEY_1")).toBe(true);
        expect(isValidSecretKey("")).toBe(false);
        expect(isValidSecretKey("lower")).toBe(false);
        expect(isValidSecretKey("A".repeat(SECRET_KEY_MAX_LENGTH + 1))).toBe(false);
    });
});
