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
