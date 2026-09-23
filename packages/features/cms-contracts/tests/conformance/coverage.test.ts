import { describe, expect, test } from "bun:test";
import {
    admitConformanceSuite,
    admitContractRelease,
    analyzeConformanceCoverage,
    parseConformanceSuite,
} from "@bernouy/cms-contracts";

const releaseFixture = (await Bun.file(
    new URL("../../fixtures/protocol-v1/conformance.contract.json", import.meta.url),
).json()) as Record<string, unknown>;
const suiteFixture = (await Bun.file(
    new URL("../../fixtures/protocol-v1/conformance.suite.json", import.meta.url),
).json()) as Record<string, unknown>;

function suite(): Record<string, unknown> {
    return structuredClone(suiteFixture);
}

function calls(value: Record<string, unknown>): Record<string, unknown>[] {
    return (value.scenarios as { calls: Record<string, unknown>[] }[])[0]!.calls;
}

function call(value: Record<string, unknown>, id: string): Record<string, unknown> {
    return calls(value).find((entry) => entry.id === id)!;
}

function removeCall(value: Record<string, unknown>, id: string): void {
    const entries = calls(value);
    entries.splice(
        entries.findIndex((entry) => entry.id === id),
        1,
    );
}

describe("conformance coverage and actors", () => {
    test("describes authored checks without claiming the provider passed", async () => {
        const release = await admitContractRelease(releaseFixture);
        const parsed = parseConformanceSuite(suite(), release);
        expect(analyzeConformanceCoverage(release, parsed)).toMatchObject({
            scenarioCount: 1,
            callCount: 5,
            capabilities: [
                { capabilityId: "item.create", called: true, successAsserted: true },
                { capabilityId: "item.find", called: true, successCalled: true, successAsserted: true },
                { capabilityId: "item.get", called: true, successAsserted: true, coveredErrorCodes: ["NOT_FOUND"] },
                { capabilityId: "item.delete", called: true, successAsserted: true },
            ],
        });
        expect(analyzeConformanceCoverage(release).capabilities[2]).toMatchObject({
            called: false,
            missingSuccessAssertion: true,
            missingErrorCodes: ["NOT_FOUND"],
        });
    });

    test("does not count a bare successful call as an assertion", async () => {
        const release = await admitContractRelease(releaseFixture);
        const document = suite();
        delete (call(document, "find").expect as Record<string, unknown>).checks;
        delete (call(document, "read").expect as Record<string, unknown>).checks;
        const parsed = parseConformanceSuite(document, release);
        expect(analyzeConformanceCoverage(release, parsed).capabilities[1]).toMatchObject({
            successCalled: true,
            successAsserted: false,
            missingSuccessAssertion: true,
        });
    });

    test("requires explicit, non-redundant reasons for coverage gaps", async () => {
        const release = await admitContractRelease(releaseFixture);
        const document = suite();
        removeCall(document, "missing");
        document.coverageExemptions = [
            { capabilityId: "item.get", errorCode: "NOT_FOUND", reason: "Unavailable in sandbox" },
        ];
        const parsed = parseConformanceSuite(document, release);
        expect(analyzeConformanceCoverage(release, parsed).capabilities[2]).toMatchObject({
            exemptedErrors: [{ code: "NOT_FOUND", reason: "Unavailable in sandbox" }],
            missingErrorCodes: [],
        });
        const redundant = suite();
        redundant.coverageExemptions = document.coverageExemptions;
        expect(() => parseConformanceSuite(redundant, release)).toThrow("redundant coverage exemption");
        const unknown = suite();
        unknown.coverageExemptions = [{ capabilityId: "item.find", errorCode: "UNKNOWN", reason: "N/A" }];
        expect(() => parseConformanceSuite(unknown, release)).toThrow("undeclared error");
        const blank = suite();
        removeCall(blank, "missing");
        blank.coverageExemptions = [{ capabilityId: "item.get", errorCode: "NOT_FOUND", reason: "  \t  " }];
        expect(() => parseConformanceSuite(blank, release)).toThrow("reason must not be blank");
        await expect(admitConformanceSuite(blank, release)).rejects.toThrow("reason must not be blank");
    });

    test("requires each declared actor to be allowed by capability access", async () => {
        const release = await admitContractRelease(releaseFixture);
        const publicActor = suite();
        call(publicActor, "find").actor = { kind: "public" };
        expect(() => parseConformanceSuite(publicActor, release)).toThrow("public actor requires public capability");
        const authenticated = suite();
        call(authenticated, "find").actor = { kind: "authenticated", label: "reader" };
        expect(() => parseConformanceSuite(authenticated, release)).toThrow("authenticated actor cannot call admin");
        const unlabeled = suite();
        call(unlabeled, "find").actor = { kind: "authenticated" };
        expect(() => parseConformanceSuite(unlabeled, release)).toThrow();
    });

    test("accepts public and labeled authenticated actors where access allows them", async () => {
        const changedRelease = structuredClone(releaseFixture);
        const capabilities = changedRelease.capabilities as Record<string, unknown>[];
        capabilities.find((entry) => entry.id === "item.find")!.access = "public";
        capabilities.find((entry) => entry.id === "item.get")!.access = "authenticated";
        const release = await admitContractRelease(changedRelease);
        const document = suite();
        document.contractDigest = release.digest;
        call(document, "find").actor = { kind: "public" };
        call(document, "read").actor = { kind: "authenticated", label: "reader" };
        call(document, "missing").actor = { kind: "authenticated", label: "reader" };
        expect(() => parseConformanceSuite(document, release)).not.toThrow();
    });
});
