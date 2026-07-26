import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    IntegrationRegistryVersionConflictError,
    type IntegrationRegistryPublisher,
} from "@bernouy/cms-integration-registry";
import { RepositoryManagementCms, REPOSITORY_PUBLICATION_PATH } from "@bernouy/cms-repository-management";
import type { Runner } from "@bernouy/http-runner";
import { PublicationTestRunner, responseJson } from "./support";

describe("repository publication conflict digest", () => {
    test("allowlists the resolved digest of the version that actually exists", async () => {
        const fixture = await packageFixture();
        const lookups: Array<readonly [string, string]> = [];
        const runner = mounted(async (kind, version) => {
            lookups.push([kind, version]);
            return fixture.digest;
        });
        const response = await runner.handle(REPOSITORY_PUBLICATION_PATH, packageRequest(fixture.bytes));

        expect(response.status).toBe(409);
        expect(await responseJson(response)).toMatchObject({
            code: "integration_version_exists",
            kind: "demo",
            version: "1.0.0",
            existingDigest: fixture.digest,
        });
        expect(lookups).toEqual([["demo", "1.0.0"]]);
    });

    test("omits unavailable, invalid, and failed lookup values", async () => {
        const fixture = await packageFixture();
        for (const lookup of [
            async () => null,
            async () => "management-secret",
            async () => Promise.reject(new Error("filesystem /private/repository")),
        ]) {
            const response = await mounted(lookup).handle(REPOSITORY_PUBLICATION_PATH, packageRequest(fixture.bytes));
            const serialized = await response.text();

            expect(response.status).toBe(409);
            expect(JSON.parse(serialized)).not.toHaveProperty("existingDigest");
            expect(serialized).not.toContain("management-secret");
            expect(serialized).not.toContain("/private/repository");
        }
    });
});

function mounted(
    existingVersionDigest: (kind: string, version: string) => string | null | Promise<string | null>,
): PublicationTestRunner {
    const runner = new PublicationTestRunner();
    const publisher: IntegrationRegistryPublisher = {
        publish: async () => Promise.reject(new IntegrationRegistryVersionConflictError("demo", "1.0.0")),
    };
    new RepositoryManagementCms({
        runner: runner as Runner,
        publisher,
        upload: { maxBodyBytes: 1024 * 1024 },
        existingVersionDigest,
    });
    return runner;
}

async function packageFixture() {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Demo\n" },
            "definition.json": { encoding: "utf8", content: "{}" },
        },
    };
    const bytes = canonicalJsonBytes(envelope);
    return { bytes, digest: await sha256Hex(bytes) };
}

function packageRequest(bytes: Uint8Array): RequestInit {
    return { method: "POST", headers: { "content-type": "application/json" }, body: bytes };
}
