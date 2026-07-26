import { afterEach, describe, expect, test } from "bun:test";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { FsIntegrationVerificationBundleStore } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, registryFixture } from "../publication/fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem verification bundle store", () => {
    test("writes immutable canonical bundles idempotently and rejects identity substitution", async () => {
        const fixture = registryFixture();
        const store = new FsIntegrationVerificationBundleStore(fixture.root);
        const envelope = verificationEnvelope();
        const digest = await computeIntegrationVerificationDigest(envelope);
        const bundle = { envelope, canonicalBytes: canonicalJsonBytes(envelope), digest };

        expect((await store.put(bundle)).digest).toBe(digest);
        expect(await store.put(bundle)).toEqual(await store.get(digest));
        await expect(store.put({ ...bundle, digest: "a".repeat(64) })).rejects.toThrow(/identity/);
    });

    test("does not traverse a substituted digest shard", async () => {
        const fixture = registryFixture();
        const store = new FsIntegrationVerificationBundleStore(fixture.root);
        const envelope = verificationEnvelope();
        const digest = await computeIntegrationVerificationDigest(envelope);
        await store.put({ envelope, canonicalBytes: canonicalJsonBytes(envelope), digest });
        const firstShard = join(
            fixture.root,
            ".registry",
            "verification-bundles",
            "objects",
            "sha256",
            shard(digest[0]!),
        );
        rmSync(firstShard, { recursive: true });
        symlinkSync("/tmp", firstShard, "dir");

        await expect(store.get(digest)).rejects.toThrow(/symlink/);
    });
});

function verificationEnvelope() {
    return validateIntegrationVerificationEnvelope({
        schema: "cms.integration.verification.v1",
        target: { kind: "demo", version: "1.0.0", packageDigest: "b".repeat(64) },
        manifest: {
            runnerRequirements: [{ name: "cms-integration-verifier", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    });
}

function shard(character: string): string {
    const value = Number.parseInt(character, 16);
    return value < 4 ? "0-3" : value < 8 ? "4-7" : value < 12 ? "8-b" : "c-f";
}
