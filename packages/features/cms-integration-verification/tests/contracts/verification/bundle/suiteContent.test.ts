import { describe, expect, test } from "bun:test";
import {
    buildIntegrationVerificationSuiteContent,
    identifyIntegrationVerificationSuiteContent,
    validateBoundIntegrationVerificationAuthorSuites,
    validateIntegrationVerificationSuiteContent,
} from "../../../../src/exports/index";
import { defineSuite, expect as verify, test as verifyTest } from "../../../../src/sdk/v1";
import { admissionSnapshot } from "../controlFixtures";
import { verificationEnvelope } from "../../fixtures";

describe("exact author suite content", () => {
    test("strictly identifies a closed suite and binds every planned author suite", async () => {
        const envelope = await verificationEnvelope();
        const contract = await identified(envelope, "contract", "public-contract");
        const conformance = await identified(envelope, "conformance", "implementation");
        const admission = {
            ...(await admissionSnapshot()),
            activeContracts: [
                {
                    contractId: "public-contract",
                    lineageId: "example-public-v1",
                    ownerVersion: "1.1.0",
                    contractDigest: contract.digest,
                },
            ],
            suites: [
                { suiteId: "implementation", source: "author-conformance" as const, contentDigest: conformance.digest },
                { suiteId: "platform-install", source: "platform" as const, contentDigest: "c".repeat(64) },
                { suiteId: "public-contract", source: "author-contract" as const, contentDigest: contract.digest },
            ],
        };
        const bound = await validateBoundIntegrationVerificationAuthorSuites(
            [
                {
                    suiteId: "public-contract",
                    source: "author-contract",
                    contentDigest: contract.digest,
                    content: contract.content,
                },
                {
                    suiteId: "implementation",
                    source: "author-conformance",
                    contentDigest: conformance.digest,
                    content: conformance.content,
                },
            ],
            admission,
        );

        expect(bound.map((entry) => entry.suiteId)).toEqual(["implementation", "public-contract"]);
    });

    test("rejects missing, extra, substituted, and non-closure content", async () => {
        const envelope = await verificationEnvelope();
        const contract = await identified(envelope, "contract", "public-contract");
        const admission = {
            ...(await admissionSnapshot()),
            activeContracts: [
                {
                    contractId: "public-contract",
                    lineageId: "example-public-v1",
                    ownerVersion: "1.1.0",
                    contractDigest: contract.digest,
                },
            ],
            suites: [
                { suiteId: "public-contract", source: "author-contract" as const, contentDigest: contract.digest },
            ],
        };
        const exact = {
            suiteId: "public-contract",
            source: "author-contract" as const,
            contentDigest: contract.digest,
            content: contract.content,
        };

        await expect(validateBoundIntegrationVerificationAuthorSuites([], admission)).rejects.toThrow(/every and only/);
        await expect(
            validateBoundIntegrationVerificationAuthorSuites([exact, { ...exact, suiteId: "extra" }], admission),
        ).rejects.toThrow();
        await expect(
            validateBoundIntegrationVerificationAuthorSuites([{ ...exact, contentDigest: "f".repeat(64) }], admission),
        ).rejects.toThrow(/canonical content digest/);
        await expect(
            validateIntegrationVerificationSuiteContent({
                ...contract.content,
                sources: [
                    ...contract.content.sources,
                    { path: "tests/unused.ts", file: { encoding: "utf8", content: "export default true;" } },
                ],
            }),
        ).rejects.toThrow(/exact entrypoint closure/);
    });

    test("exports a bounded assertion DSL from the public SDK subpath", async () => {
        const suite = defineSuite({
            tests: [
                verifyTest("deep equality", () => {
                    verify({ nested: [1, true] }).toEqual({ nested: [1, true] });
                }),
            ],
        });

        expect(suite.tests).toHaveLength(1);
        await expect(
            Promise.resolve(suite.tests[0]!.execute({ query: async () => [], fixture: () => fixture() })),
        ).resolves.toBeUndefined();
        expect(() => verify({ value: 1 }).toEqual({ value: 2 })).toThrow(/deeply equal/);
    });
});

async function identified(envelope: unknown, type: "contract" | "conformance", suiteId: string) {
    return await identifyIntegrationVerificationSuiteContent(
        await buildIntegrationVerificationSuiteContent(envelope, type, suiteId),
    );
}

function fixture() {
    return { encoding: "utf8" as const, text: () => "", bytes: () => new Uint8Array() };
}
