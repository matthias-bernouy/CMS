import { expect, test } from "bun:test";
import { secretsFixture } from "./fixture";

test("invalid data, stale versions and duplicate names refuse before changing secret state", async () => {
    const f = await secretsFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Private" });
        const credentials = { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
        const created = await f.invoke("secrets.create", {
            ...credentials,
            name: "token",
            value: "private-secret-value",
        });
        const before = { ...f.counts };
        for (const [id, input, status] of [
            ["secrets.create", { ...credentials, name: "token", value: "replacement" }, 409],
            [
                "secrets.rotate",
                { ...credentials, secretId: created.secretId, expectedVersion: 99, value: "replacement" },
                409,
            ],
            ["namespace.keys.create", { ...credentials, permissions: ["secrets.resolve"], expiresAt: null }, 422],
            [
                "namespace.keys.create",
                { ...credentials, permissions: ["secrets.resolve"], expiresAt: new Date(0).toISOString() },
                422,
            ],
            ["namespace.keys.create", { ...credentials, permissions: ["invalid"] }, 400],
            ["secrets.create", { ...credentials, name: "other", value: "" }, 400],
        ] as const) {
            const response = await f.call(id, input);
            expect(response.status, id).toBe(status);
            expect(await response.text()).not.toContain("private-secret-value");
        }
        expect(f.counts.valueWrites).toBe(before.valueWrites);
        expect(f.counts.mutations).toBe(before.mutations);
        expect(await f.invoke("secrets.resolve", { ...credentials, secretId: created.secretId })).toMatchObject({
            value: "private-secret-value",
            version: 1,
        });
    } finally {
        f.close();
    }
});

test("metadata lists keep their requested bound and do not load plaintext values", async () => {
    const f = await secretsFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Private" });
        const credentials = { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
        for (const name of ["first", "second", "third"]) {
            await f.invoke("secrets.create", { ...credentials, name, value: "private-secret-value" });
        }
        const before = { ...f.counts };
        const page = await f.invoke("secrets.list", { ...credentials, limit: 2 });
        expect(page.items).toHaveLength(2);
        expect(JSON.stringify(page)).not.toContain("private-secret-value");
        expect(f.counts.listCalls - before.listCalls).toBe(1);
        expect(f.counts.loaded - before.loaded).toBe(2);
        expect(f.counts.limit).toBe(2);
        expect(f.counts.valueReads).toBe(before.valueReads);
        const after = { ...f.counts };
        expect((await f.call("secrets.list", { ...credentials, limit: 101 })).status).toBe(400);
        expect(f.counts).toEqual(after);
    } finally {
        f.close();
    }
});
