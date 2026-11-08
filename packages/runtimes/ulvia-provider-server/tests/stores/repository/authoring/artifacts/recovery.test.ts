import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { RepositoryAuthoring } from "@bernouy/repository/repository/authoring";
import { artifactFixture, contractSnapshot, contractId } from "./fixtures";

test("artifact publication resumes source retention after restart without rebuilding or uploading", async () => {
    const f = await artifactFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        globalThis.fetch = Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) =>
                String(input).endsWith("/v1/artifact-source-snapshots/put")
                    ? new Response(null, { status: 503 })
                    : original(input, init),
            original,
        );
        await expect(
            f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest),
        ).rejects.toMatchObject({
            publicationState: "sources-pending",
            preparationId: prepared.preparationId,
            digest: prepared.digest,
        });
        await rm(join(f.host.root, prepared.preparationId, "notes"), { recursive: true });
        const restarted = new RepositoryAuthoring(f.host, f.publisher);
        let uploads = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/uploads")) {
                uploads++;
            }
            return original(input, init);
        }, original);
        expect(await restarted.publishArtifact("contract", prepared.preparationId, prepared.digest)).toMatchObject({
            added: false,
            digest: prepared.digest,
        });
        expect(uploads).toBe(0);
        expect((await restarted.artifactSources("contract", "community", contractId, "1.0.0"))?.releaseDigest).toBe(
            prepared.digest,
        );
        await f.application.pats.revoke(f.account.accountId, f.account.patId);
        await expect(restarted.publishArtifact("contract", prepared.preparationId, prepared.digest)).rejects.toThrow();
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("an unknown artifact commit outcome can be retried without a second publication", async () => {
    const f = await artifactFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            const response = await original(input, init);
            if (String(input).endsWith("/v1/uploads/commit") && response.ok) {
                await response.body?.cancel();
                throw new Error("Lost response");
            }
            return response;
        }, original);
        await expect(
            f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest),
        ).rejects.toMatchObject({ publicationState: "unknown" });
        globalThis.fetch = original;
        expect(await f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest)).toMatchObject({
            added: false,
        });
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});
