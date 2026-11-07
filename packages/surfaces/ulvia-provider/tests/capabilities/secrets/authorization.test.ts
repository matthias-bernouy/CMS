import { expect, test } from "bun:test";
import { secretsFixture } from "./fixture";

test("missing resolve permission and foreign namespace credentials refuse without plaintext reads or mutations", async () => {
    const f = await secretsFixture();
    try {
        const first = await f.invoke("namespace.create", { name: "First" });
        const other = await f.invoke("namespace.create", { name: "Other" });
        const credentials = { namespaceId: first.namespaceId, namespaceKey: first.namespaceKey };
        const created = await f.invoke("secrets.create", {
            ...credentials,
            name: "token",
            value: "private-secret-value",
        });
        const key = await f.invoke("namespace.keys.create", { ...credentials, permissions: ["secrets.metadata.read"] });
        const before = { ...f.counts };
        for (const [namespaceId, namespaceKey, status] of [
            [first.namespaceId, key.namespaceKey, 403],
            [other.namespaceId, first.namespaceKey, 404],
        ] as const) {
            const response = await f.call("secrets.resolve", { namespaceId, namespaceKey, secretId: created.secretId });
            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain("private-secret-value");
        }
        expect(f.counts.valueReads).toBe(before.valueReads);
        expect(f.counts.mutations).toBe(before.mutations);
        expect(f.counts.valueWrites).toBe(before.valueWrites);
    } finally {
        f.close();
    }
});

test("unauthenticated, non-administrator and cross-instance mutations leave business state unchanged", async () => {
    const f = await secretsFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Private" });
        const input = {
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            name: "token",
            value: "private-secret-value",
        };
        const before = { ...f.counts };
        for (const [options, status] of [
            [{ authenticated: false }, 401],
            [{ claims: { actorKind: "user" } }, 403],
            [{ claims: { instanceId: "instance-b" } }, 401],
        ] as const) {
            const response = await f.call("secrets.create", input, options);
            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain(input.value);
        }
        expect(f.counts).toEqual(before);
    } finally {
        f.close();
    }
});

test("revoked keys cannot read metadata and unexpected storage failures expose only safe localized data", async () => {
    const f = await secretsFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Private" });
        const credentials = { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
        const created = await f.invoke("secrets.create", {
            ...credentials,
            name: "token",
            value: "private-secret-value",
        });
        const key = await f.invoke("namespace.keys.create", { ...credentials, permissions: ["secrets.metadata.read"] });
        await f.invoke("namespace.keys.revoke", { ...credentials, keyId: key.keyId });
        expect((await f.call("secrets.list", { ...credentials, namespaceKey: key.namespaceKey })).status).toBe(403);
        f.failReads();
        const response = await f.call(
            "secrets.resolve",
            { ...credentials, secretId: created.secretId },
            { language: "fr" },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get("content-language")).toBe("fr");
        expect(await response.text()).not.toContain("private-secret-value");
    } finally {
        f.close();
    }
});
