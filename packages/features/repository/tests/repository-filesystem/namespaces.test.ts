import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryApplication } from "../../../../../tests/fixtures/repository/application";

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "account-namespace-"));
    const app = repositoryApplication(root);
    const a = await app.account("account-a");
    const b = await app.account("account-b");
    return {
        app,
        a,
        b,
        close: async () => {
            await app.close();
            await rm(root, { recursive: true, force: true });
        },
    };
}

test("one account wins a concurrent claim and ownership changes invalidate previous revisions", async () => {
    const f = await fixture();
    const { namespaces } = f.app;
    try {
        const claimed = await Promise.allSettled(
            [f.a, f.b].map((account) => namespaces.claim(account.accountId, "community")),
        );
        expect(claimed.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const owner = claimed[0]!.status === "fulfilled" ? f.a : f.b;
        const other = owner === f.a ? f.b : f.a;
        const view = await namespaces.get("community");
        expect(view?.revision).toBe(1);
        expect(JSON.stringify(view)).not.toContain(owner.accountId);
        expect((await namespaces.transfer(owner.accountId, "community", 1, other.accountId)).revision).toBe(2);
        let called = false;
        const mutate = async () => {
            called = true;
        };
        await expect(namespaces.execute(owner.accountId, "community", 1, mutate)).rejects.toThrow("stale");
        await expect(namespaces.execute(other.accountId, "community", 1, mutate)).rejects.toThrow("stale");
        expect(called).toBe(false);
        await namespaces.execute(other.accountId, "community", 2, mutate);
        expect(called).toBe(true);
    } finally {
        await f.close();
    }
});

test("suspension and missing owner accounts never implicitly release reserved namespaces", async () => {
    const f = await fixture();
    const { namespaces } = f.app;
    try {
        await namespaces.claim(f.a.accountId, "community");
        await namespaces.suspend(f.a.accountId, "community", 1);
        await expect(namespaces.claim(f.b.accountId, "community")).rejects.toThrow("reserved");
        const transferred = await namespaces.transfer(f.a.accountId, "community", 2, f.b.accountId);
        expect(transferred.state).toBe("suspended");
        expect(transferred.revision).toBe(3);
        await expect(namespaces.execute(f.b.accountId, "community", 3, async () => undefined)).rejects.toThrow("stale");
        f.app.accounts.delete(f.b.accountId);
        await expect(namespaces.claim(f.a.accountId, "community")).rejects.toThrow("reserved");
        expect((await namespaces.get("community"))?.state).toBe("suspended");
    } finally {
        await f.close();
    }
});

test("account deletion refuses before business side effects while namespaces remain owned", async () => {
    const f = await fixture();
    const { namespaces } = f.app;
    try {
        await namespaces.claim(f.a.accountId, "community");
        let deleted = false;
        await expect(
            namespaces.withoutOwnedNamespaces(f.a.accountId, async () => {
                deleted = true;
            }),
        ).rejects.toThrow("Transfer owned");
        expect(deleted).toBe(false);
        await namespaces.transfer(f.a.accountId, "community", 1, f.b.accountId);
        await namespaces.withoutOwnedNamespaces(f.a.accountId, async () => {
            deleted = true;
        });
        expect(deleted).toBe(true);
        expect((await namespaces.get("community"))?.revision).toBe(2);
    } finally {
        await f.close();
    }
});

test("direct capability calls enforce authentication and ownership before private reads or mutations", async () => {
    const f = await fixture();
    const { service, namespaces } = f.app;
    try {
        const before = await namespaces.claim(f.a.accountId, "community");
        const input = {
            namespace: "community",
            publisherId: "community",
            namespaceRevision: 1,
            targetAccountId: f.b.accountId,
        };
        const source = {
            namespace: input.namespace,
            namespaceRevision: 1,
            collectionId: "community/sample",
            version: "1.0.0",
        };
        const upload = { namespace: input.namespace, namespaceRevision: 1, uploadId: crypto.randomUUID() };
        const owned = [
            (account?: string) => service.namespaces.transfer(input, account),
            (account?: string) => service.namespaces.suspend(input, account),
            (account?: string) => service.publications.checkCollection({ ...input, canonicalJson: "{}" }, account),
            (account?: string) => service.sources.getCollection(source, account),
            (account?: string) =>
                service.sources.putCollection(
                    { ...source, sourceJson: "{}", releaseDigest: "sha256:" + "0".repeat(64) },
                    account,
                ),
            (account?: string) =>
                service.publications.yank(
                    {
                        kind: "collection",
                        publisherId: input.namespace,
                        id: "community/sample",
                        version: "1.0.0",
                        namespaceRevision: 1,
                        expectedRevision: 1,
                        reason: null,
                    },
                    account,
                ),
            (account?: string) => service.publications.begin(input, account),
            (account?: string) => service.publications.status(upload, account),
            (account?: string) =>
                service.publications.asset(
                    { ...upload, assetId: "asset", contentDigest: "sha256:" + "0".repeat(64) },
                    account,
                ),
            (account?: string) => service.publications.commit(upload, account),
            (account?: string) => service.publications.abort(upload, account),
        ];
        for (const call of [
            (account?: string) => service.namespaces.list(account),
            (account?: string) => service.namespaces.claim(input, account),
            ...owned,
        ]) {
            await expect(Promise.resolve().then(() => call())).rejects.toThrow("An authenticated account is required");
        }
        for (const call of owned) {
            await expect(Promise.resolve().then(() => call(f.b.accountId))).rejects.toThrow(
                "Namespace ownership is unavailable or stale",
            );
        }
        expect(await namespaces.get("community")).toEqual(before);
        expect(await service.namespaces.list(f.b.accountId)).toEqual({
            namespaces: [],
        });
        expect(await service.reads.catalogue({ kind: "contract", limit: 20 })).toEqual({ releases: [] });
    } finally {
        await f.close();
    }
});
