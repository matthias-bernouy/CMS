import { expect, test } from "bun:test";
import { materialFixture, authenticationDocument, runtimeSecrets } from "./fixture";
import { MongoInstanceAuthenticationReader } from "../../../src/runtime/authentication/material/MongoInstanceAuthenticationReader";

const selector = { field: "accessTokenHash" as const, value: authenticationDocument().accessTokenHash };

test("a warm authentication freshly joins authority and ciphertext in one command without caching KEK or sessions", async () => {
    const f = materialFixture();
    const first = await f.reader.read(selector);
    expect(f.reads).toBe(2);
    expect(f.decrypts).toBe(1);
    expect(first?.secrets).toEqual({
        instanceAccessToken: runtimeSecrets.instanceAccessToken,
        invocationSecret: runtimeSecrets.invocationSecret,
    });
    const warm = await f.reader.read(selector);
    expect(warm).toEqual(first);
    expect(f.reads).toBe(3);
    expect(f.decrypts).toBe(1);
    expect(Object.isFrozen(warm!.secrets)).toBe(true);
    f.document!.instance.label = "Updated";
    expect((await f.reader.read(selector))?.instance.label).toBe("Updated");
    f.document = null;
    expect(await f.reader.read(selector)).toBeNull();
});

test("cache entries cannot substitute for fresh reads, missing secrets or matching instance ownership", async () => {
    const f = materialFixture();
    await f.reader.read(selector);
    f.error = new Error("database unavailable");
    await expect(f.reader.read(selector)).rejects.toThrow("database unavailable");
    f.error = undefined;
    f.document!.instance.id = "instance:other";
    await expect(f.reader.read(selector)).rejects.toThrow("inconsistent");
    f.document = authenticationDocument();
    f.document.secret._id = "another-secret";
    await expect(f.reader.read(selector)).rejects.toThrow("inconsistent");
});

test("readers never share decrypted values across databases or crypto scopes", async () => {
    const f = materialFixture();
    const other = materialFixture();
    other.decrypt = async () => JSON.stringify({ ...runtimeSecrets, invocationSecret: "X".repeat(43) });
    expect((await f.reader.read(selector))?.secrets.invocationSecret).toBe(runtimeSecrets.invocationSecret);
    expect((await other.reader.read(selector))?.secrets.invocationSecret).toBe("X".repeat(43));
    let usedScope: string | undefined;
    f.decrypt = async (scope) => {
        usedScope = scope;
        return JSON.stringify(runtimeSecrets);
    };
    await new MongoInstanceAuthenticationReader(f.db, "another-scope", f.crypto).read(selector);
    expect(usedScope).toBe("another-scope");
    expect(f.decrypts).toBe(2);
});
