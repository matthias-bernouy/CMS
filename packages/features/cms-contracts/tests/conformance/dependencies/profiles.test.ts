import { describe, expect, test } from "bun:test";
import {
    admitConformanceSuite,
    admitConformanceSuiteJson,
    admitContractRelease,
    DEFAULT_RELEASE_LIMITS,
    parseConformanceSuite,
    parseConformanceSuiteJson,
} from "@bernouy/cms-contracts";
import { capability, contract, fixture, reference, requirement } from "./fixtures";

describe("conformance dependency profiles", () => {
    test("admits the same checkout scenario against both payment majors with exact pins", async () => {
        const { suite, admission, admissions } = await fixture();
        const result = await admitConformanceSuite(suite, admission, [], undefined, admissions);
        expect(result.suite.dependencyProfiles?.map((profile) => profile.releases[0]?.version)).toEqual([
            "1.0.0",
            "2.0.0",
        ]);
        expect(Object.isFrozen(result.suite.dependencyProfiles?.[0]?.releases)).toBe(true);
        const reordered = { ...suite, dependencyProfiles: [...suite.dependencyProfiles!].reverse() };
        const json = await admitConformanceSuiteJson(JSON.stringify(reordered), admission, [], undefined, admissions);
        expect(json.digest).toBe(result.digest);
        expect(parseConformanceSuiteJson(JSON.stringify(suite), admission, undefined, admissions)).toEqual(
            result.suite,
        );
    });

    test("requires profiles and covers every declared root alternative", async () => {
        const { suite, admission, admissions } = await fixture();
        const { dependencyProfiles, ...withoutProfiles } = suite;
        expect(() => parseConformanceSuite(withoutProfiles, admission)).toThrow("require dependency profiles");
        expect(() =>
            parseConformanceSuite(
                { ...suite, dependencyProfiles: dependencyProfiles!.slice(0, 1) },
                admission,
                undefined,
                admissions.slice(0, 1),
            ),
        ).toThrow("do not cover payment:payment.charge ^2.0.0");
    });

    test("rejects empty, duplicate and unbounded profiles or release selections", async () => {
        const { suite, admission, admissions } = await fixture();
        const profile = suite.dependencyProfiles![0]!;
        for (const dependencyProfiles of [
            [],
            [profile, profile],
            [profile, { ...profile, id: "other" }],
            [{ ...profile, releases: [] }],
            [{ ...profile, releases: [...profile.releases, ...profile.releases] }],
        ]) {
            expect(() =>
                parseConformanceSuite({ ...suite, dependencyProfiles }, admission, undefined, admissions),
            ).toThrow();
        }
        expect(() =>
            parseConformanceSuite(
                suite,
                admission,
                { ...DEFAULT_RELEASE_LIMITS, maxConformanceDependencyProfiles: 1 },
                admissions,
            ),
        ).toThrow("profiles must be nonempty and bounded");
        expect(() =>
            parseConformanceSuite(
                suite,
                admission,
                { ...DEFAULT_RELEASE_LIMITS, maxConformanceDependenciesPerProfile: 0 },
                admissions,
            ),
        ).toThrow("releases must be nonempty and bounded");
    });

    test("rejects absent artifacts and mismatched contract IDs, versions or digests", async () => {
        const { suite, admission, admissions } = await fixture();
        expect(() => parseConformanceSuite(suite, admission)).toThrow("does not match a supplied admitted release");
        const profile = suite.dependencyProfiles![0]!;
        for (const changes of [
            { contractId: "other" },
            { version: "1.0.1" },
            { digest: `sha256:${"0".repeat(64)}` },
            { digest: "broken" },
        ]) {
            const dependencyProfiles = [
                { ...profile, releases: [{ ...profile.releases[0], ...changes }] },
                suite.dependencyProfiles![1],
            ];
            expect(() =>
                parseConformanceSuite({ ...suite, dependencyProfiles }, admission, undefined, admissions),
            ).toThrow();
        }
    });

    test("rejects unrelated releases and external context, including the root contract", async () => {
        const { suite, admission, admissions } = await fixture();
        const extra = await admitContractRelease(contract("unrelated", "1.0.0", [capability("other")]));
        expect(() => parseConformanceSuite(suite, admission, undefined, [...admissions, extra])).toThrow(
            "unused conformance dependency artifact",
        );
        const profiles = suite.dependencyProfiles!.map((profile) => ({
            ...profile,
            releases: [...profile.releases, reference(extra)],
        }));
        expect(() =>
            parseConformanceSuite({ ...suite, dependencyProfiles: profiles }, admission, undefined, [
                ...admissions,
                extra,
            ]),
        ).toThrow("unused dependency profile release");
        const ownProfiles = suite.dependencyProfiles!.map((profile) => ({
            ...profile,
            releases: [...profile.releases, reference(admission)],
        }));
        expect(() =>
            parseConformanceSuite({ ...suite, dependencyProfiles: ownProfiles }, admission, undefined, [
                ...admissions,
                admission,
            ]),
        ).toThrow("cannot replace the tested contract");
        expect(() => parseConformanceSuite(suite, admission, undefined, [...admissions, admissions[0]!])).toThrow(
            "duplicate conformance dependency artifact",
        );
    });

    test("verifies dependency artifact integrity before admitting the suite", async () => {
        const { suite, admission, admissions } = await fixture();
        const tampered = { ...admissions[1]!, release: { ...admissions[1]!.release, description: "tampered" } };
        await expect(
            admitConformanceSuite(suite, admission, [], undefined, [admissions[0]!, tampered]),
        ).rejects.toThrow("integrity verification");
    });

    test("checks required capability existence and version constraints in every profile", async () => {
        const missing = contract("payment", "1.0.0", [capability("fixture.prepare"), capability("payment.inspect")]);
        const root = contract("commerce", "1.0.0", [
            capability("checkout.start", [requirement("payment", "payment.charge", "^1.0.0")]),
        ]);
        const first = await fixture([missing], root);
        expect(() => parseConformanceSuite(first.suite, first.admission, undefined, first.admissions)).toThrow(
            "unknown conformance capability",
        );
        const wrong = await fixture(undefined, root);
        expect(() => parseConformanceSuite(wrong.suite, wrong.admission, undefined, wrong.admissions)).toThrow(
            "does not satisfy payment:payment.charge",
        );
    });
});
