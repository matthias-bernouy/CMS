import { describe, expect, test } from "bun:test";
import {
    analyzeConformanceCoverage,
    admitContractRelease,
    parseConformanceSuite,
} from "@bernouy/cms-repository/contracts";
import { capability, changeCall, contract, fixture, payment, requirement } from "./fixtures";

describe("dependency scenario validation", () => {
    test("validates captured types against every selected dependency release", async () => {
        const second = payment("2.0.0");
        const altered = {
            ...second,
            capabilities: second.capabilities.map((entry) =>
                entry.id === "fixture.prepare"
                    ? {
                          ...entry,
                          output: { ...entry.input, properties: { id: { type: "string" as const, maxLength: 128 } } },
                      }
                    : entry,
            ),
        };
        const { suite, admission, admissions } = await fixture([payment("1.0.0"), altered]);
        expect(() => parseConformanceSuite(suite, admission, undefined, admissions)).toThrow(
            "captured value is incompatible",
        );
    });

    test("checks external actors and assertions against every profile", async () => {
        const first = payment("1.0.0");
        const second = payment("2.0.0");
        const publicFirst = {
            ...first,
            capabilities: first.capabilities.map((entry) => ({ ...entry, access: "public" as const })),
        };
        const example = await fixture([publicFirst, second]);
        const actorSuite = changeCall(example.suite, "prepare", { actor: { kind: "public" } });
        expect(() => parseConformanceSuite(actorSuite, example.admission, undefined, example.admissions)).toThrow(
            "public actor requires public capability",
        );
        const modified = {
            ...second,
            capabilities: second.capabilities.map((entry) =>
                entry.id === "payment.inspect"
                    ? { ...entry, output: { ...entry.input, properties: { id: { type: "integer" as const } } } }
                    : entry,
            ),
        };
        const assertion = await fixture([first, modified]);
        expect(() =>
            parseConformanceSuite(assertion.suite, assertion.admission, undefined, assertion.admissions),
        ).toThrow("captured value is incompatible");
    });

    test("rejects undeclared external targets and validates setup capability existence", async () => {
        const { suite, admission, admissions } = await fixture();
        const wrongTarget = changeCall(suite, "prepare", { dependencyContractId: "emailer" });
        expect(() => parseConformanceSuite(wrongTarget, admission, undefined, admissions)).toThrow(
            "undeclared dependency contract",
        );
        const wrongCapability = changeCall(suite, "prepare", { capabilityId: "fixture.missing" });
        expect(() => parseConformanceSuite(wrongCapability, admission, undefined, admissions)).toThrow(
            "unknown conformance capability",
        );
        const localTarget = changeCall(suite, "checkout", { dependencyContractId: "commerce" });
        expect(() => parseConformanceSuite(localTarget, admission, undefined, admissions)).toThrow(
            "local calls must omit dependencyContractId",
        );
    });

    test("does not let dependency calls satisfy root coverage or invalidate root exemptions", async () => {
        const root = contract("commerce", "1.0.0", [
            capability("checkout.start", [requirement()]),
            capability("fixture.prepare"),
        ]);
        const { suite, admission, admissions } = await fixture(undefined, root);
        const document = {
            ...suite,
            coverageExemptions: [{ capabilityId: "fixture.prepare", reason: "Covered by a separate suite." }],
        };
        const parsed = parseConformanceSuite(document, admission, undefined, admissions);
        const coverage = analyzeConformanceCoverage(admission, parsed);
        const absent = coverage.capabilities.find((entry) => entry.capabilityId === "fixture.prepare");
        expect(absent?.called).toBe(false);
        expect(absent?.successAsserted).toBe(false);
        expect(coverage.capabilities.find((entry) => entry.capabilityId === "checkout.start")?.successAsserted).toBe(
            true,
        );
    });

    test("profiles are needed only for requirements of exercised root capabilities", async () => {
        const root = contract("commerce", "1.0.0", [
            capability("checkout.start", [requirement()]),
            capability("standalone"),
        ]);
        const { suite, admission } = await fixture(undefined, root);
        const { dependencyProfiles: _, ...withoutProfiles } = suite;
        const document = {
            ...withoutProfiles,
            scenarios: [
                {
                    id: "alone",
                    calls: [
                        {
                            id: "call",
                            capabilityId: "standalone",
                            actor: { kind: "admin" },
                            input: { id: "sample" },
                            expect: { kind: "success" },
                        },
                    ],
                },
            ],
        };
        expect(() => parseConformanceSuite(document, admission)).not.toThrow();
    });

    test("does not resolve undeclared fixture assets through a dependency release", async () => {
        const second = payment("2.0.0");
        const binary = {
            ...second,
            capabilities: second.capabilities.map((entry) =>
                entry.id === "payment.inspect"
                    ? {
                          ...entry,
                          output: { type: "binary" as const, maxBytes: 100, mediaTypes: ["application/pdf"] },
                          binding: {
                              ...entry.binding,
                              response: { ...entry.binding.response, contentTypes: ["application/pdf"] },
                          },
                      }
                    : entry,
            ),
        };
        const { suite, admission, admissions } = await fixture([payment("1.0.0"), binary]);
        const document = changeCall(suite, "inspect", {
            expect: { kind: "success", checks: [{ path: "", equals: { assetId: "receipt" } }] },
        });
        // Limit the test to the binary profile so the absence of suite fixture assets is the rejected condition.
        const root = await admitContractRelease({
            ...admission.release,
            capabilities: [capability("checkout.start", [requirement("payment", "payment.charge", "^2.0.0")])],
        });
        const binaryOnly = {
            ...document,
            contractDigest: root.digest,
            dependencyProfiles: document.dependencyProfiles!.slice(1),
        };
        expect(() => parseConformanceSuite(binaryOnly, root, undefined, admissions.slice(1))).toThrow(
            "incompatible or undeclared fixture asset",
        );
    });
});
