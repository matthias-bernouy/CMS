import { describe, expect, test } from "bun:test";
import {
    admitConformanceSuite,
    admitConformanceSuiteJson,
    admitContractRelease,
    computeReleaseDigest,
    parseConformanceSuite,
    parseConformanceSuiteJson,
} from "@bernouy/cms-repository/contracts";

const releaseFixture = (await Bun.file(
    new URL("../../../fixtures/contracts/protocol-v1/conformance.contract.json", import.meta.url),
).json()) as Record<string, unknown>;
const suiteFixture = (await Bun.file(
    new URL("../../../fixtures/contracts/protocol-v1/conformance.suite.json", import.meta.url),
).json()) as Record<string, unknown>;

function suite(): Record<string, unknown> {
    return structuredClone(suiteFixture);
}

describe("conformance suite admission", () => {
    test("pins a separately versioned suite to the exact release digest", async () => {
        const release = await admitContractRelease(releaseFixture);
        expect(release.digest).toBe("sha256:cfd67479c4a797381731ed58b9799351ffb619659f789a070ab5f7665c7cf98f");
        const first = await admitConformanceSuite(suite(), release);
        expect(first.digest).toBe("sha256:dc5b4fdf05033ca81328d4b007c84bf3be1e20391ee2ccfd8a899d1b0a0411c3");
        expect(first.suite).not.toHaveProperty("dependencyProfiles");
        const next = suite();
        next.version = "0.1.1";
        const nextCalls = (next.scenarios as { calls: { id: string; expect: Record<string, unknown> }[] }[])[0]!.calls;
        const create = nextCalls.find((call) => call.id === "create")!;
        create.expect.checks = [{ path: "/id", present: true }];
        const second = await admitConformanceSuite(next, release);
        expect(second.digest).not.toBe(first.digest);
        expect(release.digest).toBe(await computeReleaseDigest(releaseFixture));
        expect(Object.isFrozen(first.suite)).toBe(true);
        expect(first.canonicalJson).toContain("contract-conformance-suite");
    });

    test("owns the suite document before verifying asynchronous dependencies", async () => {
        const release = await admitContractRelease(releaseFixture);
        const document = suite();
        const pending = admitConformanceSuite(document, release);
        document.version = "caller-mutated";
        (document.scenarios as unknown[]).length = 0;

        const admitted = await pending;
        expect(admitted.suite.version).toBe("0.1.0");
        expect(admitted.suite.scenarios).not.toHaveLength(0);
    });

    test("rejects a mismatched release reference, publisher, or unsupported isolation", async () => {
        const release = await admitContractRelease(releaseFixture);
        const digest = suite();
        digest.contractDigest = `sha256:${"0".repeat(64)}`;
        expect(() => parseConformanceSuite(digest, release)).toThrow("suite does not match");
        const publisher = suite();
        publisher.publisherId = "someone.else";
        expect(() => parseConformanceSuite(publisher, release)).toThrow("suite does not match");
        const isolation = suite();
        delete isolation.isolation;
        expect(() => parseConformanceSuite(isolation, release)).toThrow("disposable-tenant isolation");
    });

    test("rejects unknown fields and duplicate JSON keys on the suite path", async () => {
        const release = await admitContractRelease(releaseFixture);
        const extra = suite();
        extra.endpoint = "https://provider.example";
        expect(() => parseConformanceSuite(extra, release)).toThrow("unknown");
        const json = JSON.stringify(suite()).replace('"version":"0.1.0"', '"version":"0.1.0","version":"0.1.1"');
        expect(() => parseConformanceSuiteJson(json, release)).toThrow();
        await expect(admitConformanceSuiteJson(json, release)).rejects.toThrow();
    });

    test("verifies suite-owned binary asset bytes independently of the release", async () => {
        const document = (await Bun.file(
            new URL("../../../fixtures/contracts/protocol-v1/mock.contract.json", import.meta.url),
        ).json()) as Record<string, unknown>;
        delete document.fixtureAssets;
        delete (document.capabilities as Record<string, unknown>[])[0]!.mocks;
        const release = await admitContractRelease(document);
        const bytes = new Uint8Array(
            await Bun.file(
                new URL("../../../fixtures/contracts/protocol-v1/mock-assets/receipt.svg", import.meta.url),
            ).arrayBuffer(),
        );
        const suiteDocument = {
            kind: "contract-conformance-suite",
            protocol: "ulvia-conformance/v1",
            contractId: release.release.contractId,
            contractVersion: release.release.version,
            contractDigest: release.digest,
            publisherId: release.release.publisherId,
            version: "0.1.0",
            isolation: "disposable-tenant",
            fixtureAssets: [
                {
                    id: "receipt.svg",
                    mediaType: "image/svg+xml",
                    byteLength: 200,
                    digest: "sha256:61cc3d4fd2135663e047b9dfab68367dedf9df8e2516dded57257a06463ffaa9",
                },
            ],
            scenarios: [
                {
                    id: "receipt-render",
                    calls: [
                        {
                            id: "render",
                            capabilityId: "receipt.render",
                            actor: { kind: "admin" },
                            input: { receiptId: "example" },
                            expect: { kind: "success", checks: [{ path: "", equals: { assetId: "receipt.svg" } }] },
                        },
                    ],
                },
            ],
        };
        const admitted = await admitConformanceSuite(suiteDocument, release, [{ id: "receipt.svg", bytes }]);
        expect(admitted.fixtureAssets).toHaveLength(1);
        await expect(admitConformanceSuite(suiteDocument, release)).rejects.toThrow("asset set");
        await expect(
            admitConformanceSuite(suiteDocument, release, [{ id: "receipt.svg", bytes: new Uint8Array(200) }]),
        ).rejects.toThrow("digest mismatch");
        const broken = structuredClone(suiteDocument);
        broken.scenarios[0]!.calls[0]!.expect.checks[0]!.equals.assetId = "unknown.svg";
        expect(() => parseConformanceSuite(broken, release)).toThrow("incompatible or undeclared fixture asset");
    });
});
