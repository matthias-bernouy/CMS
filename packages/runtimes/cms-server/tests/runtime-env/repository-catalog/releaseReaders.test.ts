import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import { HttpRepositoryReleaseReader, HttpRepositoryVerificationBundleReader } from "../../../src/repositoryCatalog";
import { releaseDocument } from "./fixtures";

const PACKAGE_DIGEST = "a".repeat(64);

describe("repository release HTTP readers", () => {
    test("validates and returns an exact public release projection", async () => {
        const value = releaseDocument("1.0.0");
        const fetchImpl: typeof fetch = async () => jsonResponse(value, "b".repeat(64));
        const reader = new HttpRepositoryReleaseReader({
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fetchImpl,
            timeoutMs: 1_000,
            maxResponseBytes: 1_048_576,
        });

        await expect(reader.get("commerce", "1.0.0")).resolves.toMatchObject({
            kind: "commerce",
            version: "1.0.0",
            verification: { activeContracts: [{ contractId: "public-api" }] },
            migrations: [
                {
                    cutoverEvidence: {
                        cmsMediated: { outcome: "passed", evidenceDigest: "c".repeat(64) },
                        providerDirect: { outcome: "passed", evidenceDigest: "c".repeat(64) },
                        activation: { outcome: "passed", evidenceDigest: "c".repeat(64) },
                    },
                },
            ],
        });
    });

    test("rejects private finding paths and malformed migration cutover evidence", async () => {
        const privateFinding = releaseDocument("1.0.0");
        privateFinding.compatibility.findings.push({
            findingId: "d".repeat(64),
            classification: "compatible",
            surface: "definition",
            path: "/registry/private/definition.json",
            code: "definition-stable",
            message: "Stable",
        } as never);
        const missingDigest = releaseDocument("1.0.0");
        missingDigest.migrations[0]!.cutoverEvidence.cmsMediated = { outcome: "passed" };
        const inconsistentApplicability = releaseDocument("1.0.0");
        inconsistentApplicability.migrations[0]!.cutoverEvidence.cmsMediated = { outcome: "not-applicable" };

        for (const value of [privateFinding, missingDigest, inconsistentApplicability]) {
            const reader = new HttpRepositoryReleaseReader({
                baseUrl: "https://repository.example/.cms/repository",
                fetch: async () => jsonResponse(value, "b".repeat(64)),
                timeoutMs: 1_000,
                maxResponseBytes: 1_048_576,
            });
            await expect(reader.get("commerce", "1.0.0")).rejects.toBeInstanceOf(IntegrationRepositoryContractError);
        }
    });

    test("recomputes verification identity and rejects a substituted validator", async () => {
        const envelope = verificationEnvelope();
        const digest = await computeIntegrationVerificationDigest(envelope);
        let validator = digest;
        const fetchImpl: typeof fetch = async () => jsonResponse(envelope, validator);
        const reader = new HttpRepositoryVerificationBundleReader({
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fetchImpl,
            timeoutMs: 1_000,
            maxResponseBytes: 1_048_576,
        });

        const bundle = await reader.get(digest);
        expect(bundle).toEqual({ envelope, canonicalBytes: canonicalJsonBytes(envelope), digest });

        validator = "f".repeat(64);
        await expect(reader.get(digest)).rejects.toBeInstanceOf(IntegrationRepositoryContractError);
        await expect(reader.get("invalid")).rejects.toThrow("lowercase SHA-256");
    });
});

function verificationEnvelope(): IntegrationVerificationEnvelopeV1 {
    return {
        schema: "cms.integration.verification.v1",
        target: { kind: "commerce", version: "1.0.0", packageDigest: PACKAGE_DIGEST },
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    };
}

function jsonResponse(value: unknown, etag: string): Response {
    const bytes = canonicalJsonBytes(value);
    return new Response(bytes, {
        headers: {
            "content-length": String(bytes.byteLength),
            "content-type": "application/json; charset=utf-8",
            etag: `"${etag}"`,
        },
    });
}
