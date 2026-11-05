import { expect, test } from "bun:test";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CollectionAuthoring, CollectionPublicationRecoveryError } from "@bernouy/cms-repository/repository/authoring";
import { authoringFixture, sourceSnapshot } from "./fixture";

test("durable publication receipt resumes private sources after restart without rebuilding or uploading", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.authoring.prepare(sourceSnapshot());
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith("/v1/source-snapshots/put")) {
                return new Response(null, { status: 503 });
            }
            return original(input, init);
        }, original);
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toMatchObject({
            publicationState: "sources-pending",
            preparationId: prepared.preparationId,
            digest: prepared.digest,
        });
        expect(await f.authoring.sources("community", "community/sample", "1.0.0")).toBeNull();
        expect(
            JSON.parse(
                await readFile(join(f.root, "preparations", prepared.preparationId, "publication.json"), "utf8"),
            ),
        ).toMatchObject({ sourcesStored: false, digest: prepared.digest });
        await rm(join(f.root, "preparations", prepared.preparationId, "sample"), { recursive: true });
        const restarted = new CollectionAuthoring(
            {
                root: join(f.root, "preparations"),
                contracts: f.contracts,
                readAsset: async () => {
                    throw new Error("No rebuild expected");
                },
            },
            f.publisher,
        );
        let uploads = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/uploads")) {
                uploads++;
            }
            return original(input, init);
        }, original);
        expect(await restarted.publish(prepared.preparationId, prepared.digest)).toMatchObject({
            added: false,
            digest: prepared.digest,
        });
        expect(uploads).toBe(0);
        expect((await restarted.sources("community", "community/sample", "1.0.0"))?.releaseDigest).toBe(
            prepared.digest,
        );
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("lost commit responses expose an unknown outcome and exact replay completes one immutable release", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.authoring.prepare(sourceSnapshot());
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            const response = await original(input, init);
            if (String(input).endsWith("/v1/uploads/commit") && response.ok) {
                await response.body?.cancel();
                throw new Error("Lost commit response");
            }
            return response;
        }, original);
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toMatchObject({
            publicationState: "unknown",
        });
        globalThis.fetch = original;
        expect(await f.authoring.publish(prepared.preparationId, prepared.digest)).toMatchObject({
            added: false,
            digest: prepared.digest,
        });
        expect((await f.authoring.sources("community", "community/sample", "1.0.0"))?.releaseDigest).toBe(
            prepared.digest,
        );
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("resuming a receipt still requires live namespace authority", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.authoring.prepare(sourceSnapshot());
        globalThis.fetch = Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) =>
                String(input).endsWith("/v1/source-snapshots/put")
                    ? new Response(null, { status: 503 })
                    : original(input, init),
            original,
        );
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toBeInstanceOf(
            CollectionPublicationRecoveryError,
        );
        globalThis.fetch = original;
        await f.application.pats.revoke(f.account.accountId, f.account.patId);
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow();
        expect(
            JSON.parse(
                await readFile(join(f.root, "preparations", prepared.preparationId, "publication.json"), "utf8"),
            ),
        ).toMatchObject({ sourcesStored: false });
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});
