import { describe, expect, test } from "bun:test";
import { admitContractRelease, parseConformanceSuite } from "@bernouy/cms-repository/contracts";
import { capability, contract, fixture, payment, reference, requirement } from "./fixtures";

async function graphFixture(cycle = false, conflicting = false, setupRequirement = false) {
    const mail = await admitContractRelease(
        contract("emailer", "1.0.0", [
            capability("mail.send", cycle ? [requirement("payment", "payment.charge", "^1.0.0")] : undefined),
        ]),
    );
    const requirements = [requirement("payment", "payment.charge", "^1.0.0")];
    if (conflicting) {
        requirements.push(requirement("emailer", "mail.send", "^2.0.0"));
    }
    const root = contract("commerce", "1.0.0", [capability("checkout.start", requirements)]);
    const original = payment("1.0.0");
    const selected = {
        ...original,
        capabilities: original.capabilities.map((entry) =>
            entry.id === (setupRequirement ? "fixture.prepare" : "payment.charge")
                ? { ...entry, requires: [requirement("emailer", "mail.send", "^1.0.0")] }
                : entry,
        ),
    };
    const base = await fixture([selected], root);
    return {
        ...base,
        admissions: [...base.admissions, mail],
        suite: {
            ...base.suite,
            dependencyProfiles: [
                {
                    ...base.suite.dependencyProfiles![0]!,
                    releases: [...base.suite.dependencyProfiles![0]!.releases, reference(mail)],
                },
            ],
        },
    };
}

describe("conformance dependency graph", () => {
    test("resolves transitive requirements without network or catalogue resolution", async () => {
        const { suite, admission, admissions } = await graphFixture();
        expect(() => parseConformanceSuite(suite, admission, undefined, admissions)).not.toThrow();
        const missing = {
            ...suite,
            dependencyProfiles: [
                { ...suite.dependencyProfiles[0]!, releases: suite.dependencyProfiles[0]!.releases.slice(0, 1) },
            ],
        };
        expect(() => parseConformanceSuite(missing, admission, undefined, admissions.slice(0, 1))).toThrow(
            "does not satisfy emailer:mail.send",
        );
    });

    test("includes additional requirements introduced by external setup calls", async () => {
        const { suite, admission, admissions } = await graphFixture(false, false, true);
        expect(() => parseConformanceSuite(suite, admission, undefined, admissions)).not.toThrow();
    });

    test("rejects capability dependency cycles and mutually incompatible version constraints", async () => {
        const cycle = await graphFixture(true);
        expect(() => parseConformanceSuite(cycle.suite, cycle.admission, undefined, cycle.admissions)).toThrow(
            "cyclic conformance dependency requirements",
        );
        const conflict = await graphFixture(false, true);
        expect(() => parseConformanceSuite(conflict.suite, conflict.admission, undefined, conflict.admissions)).toThrow(
            "does not satisfy emailer:mail.send ^2.0.0",
        );
    });
});
