import { describe, test, expect } from "bun:test";
import { ValidatingSecretStore, SecretValidationError, InMemorySecretStore } from "@bernouy/cms-secrets";

describe("ValidatingSecretStore", () => {
    test("accepts an env-var-style key and delegates", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        await store.set("STRIPE_KEY", "sk_live");
        expect(await store.get("STRIPE_KEY")).toBe("sk_live");
    });

    test("rejects malformed keys", async () => {
        const store = new ValidatingSecretStore(new InMemorySecretStore());
        for (const bad of ["lowercase", "1LEADING", "WITH-DASH", "", "A".repeat(129)]) {
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
