import { describe, expect, test } from "bun:test";
import {
    analyzeConformanceCoverage,
    parseConformanceSuite,
    type ContractConformanceSuite,
} from "@bernouy/cms-contracts";
import { capability, contract, fixture, payment, requirement } from "./fixtures";

function variants(suite: ContractConformanceSuite): ContractConformanceSuite {
    const scenario = suite.scenarios[0]!;
    return {
        ...suite,
        scenarios: [
            { ...scenario, id: "checkout-v1", profiles: ["payment-v1"] },
            {
                ...scenario,
                id: "checkout-v2",
                profiles: ["payment-v2"],
                calls: scenario.calls.map((call) =>
                    call.id === "prepare" ? { ...call, input: { reference: "sample" } } : call,
                ),
            },
        ],
    };
}

describe("profile-specific conformance scenarios", () => {
    test("admits different setup inputs for two supported dependency majors", async () => {
        const second = payment("2.0.0");
        const changed = {
            ...second,
            capabilities: second.capabilities.map((entry) =>
                entry.id === "fixture.prepare"
                    ? {
                          ...entry,
                          input: {
                              type: "object" as const,
                              properties: { reference: { type: "string" as const, maxLength: 64 } },
                              required: ["reference"],
                          },
                      }
                    : entry,
            ),
        };
        const { suite, admission, admissions } = await fixture([payment("1.0.0"), changed]);
        expect(() => parseConformanceSuite(suite, admission, undefined, admissions)).toThrow();
        const parsed = parseConformanceSuite(variants(suite), admission, undefined, admissions);
        expect(parsed.scenarios.map((scenario) => scenario.profiles)).toEqual([["payment-v1"], ["payment-v2"]]);
        const coverage = analyzeConformanceCoverage(admission, parsed);
        expect(
            coverage.profiles?.map((profile) => [profile.profileId, profile.scenarioCount, profile.callCount]),
        ).toEqual([
            ["payment-v1", 1, 3],
            ["payment-v2", 1, 3],
        ]);
    });

    test("rejects unknown, empty and duplicate selectors and unused profiles", async () => {
        const { suite, admission, admissions } = await fixture();
        for (const profiles of [[], ["missing"], ["payment-v1", "payment-v1"], ["payment-v1"]]) {
            const document = { ...suite, scenarios: suite.scenarios.map((scenario) => ({ ...scenario, profiles })) };
            expect(() => parseConformanceSuite(document, admission, undefined, admissions)).toThrow();
        }
    });

    test("does not count a selected release as support coverage for an uncalled capability", async () => {
        const root = contract("commerce", "1.0.0", [
            capability("checkout.start", [requirement()]),
            capability("status", [requirement("payment", "payment.charge", "^2.0.0")]),
        ]);
        const { suite, admission, admissions } = await fixture(undefined, root);
        const first = suite.scenarios[0]!;
        const document = {
            ...suite,
            scenarios: [
                { ...first, profiles: ["payment-v1"] },
                {
                    id: "status",
                    profiles: ["payment-v2"],
                    calls: [
                        {
                            id: "status",
                            capabilityId: "status",
                            actor: { kind: "admin" },
                            input: { id: "sample" },
                            expect: { kind: "success" },
                        },
                    ],
                },
            ],
        };
        expect(() => parseConformanceSuite(document, admission, undefined, admissions)).toThrow(
            "do not cover payment:payment.charge ^2.0.0",
        );
    });

    test("equivalent accepted ranges without support partitions have identical coverage requirements", async () => {
        for (const versionRange of ["^1.0.0 || ^2.0.0", ">=1.0.0 <3.0.0"]) {
            const root = contract("commerce", "1.0.0", [
                capability("checkout.start", [{ contractId: "payment", capabilityId: "payment.charge", versionRange }]),
            ]);
            const { suite, admission, admissions } = await fixture([payment("1.0.0")], root);
            expect(() => parseConformanceSuite(suite, admission, undefined, admissions)).not.toThrow();
        }
    });
});
