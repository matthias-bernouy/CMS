import { describe, expect, test } from "bun:test";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import {
    assertInitialIntegrationVerificationBackfillState,
    backfilledIntegrationIndex,
    type IntegrationVerificationBackfillState,
} from "../../../src/default-implementation/fs/registry/history/backfill/validation";

describe("verification backfill persisted state", () => {
    test("repairs channels while preserving blocked and inadmissible versions", () => {
        const previous: IntegrationDefinitionIndex = {
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            latest: "1.1.0",
            versions: [
                versionEntry("1.0.0", "blocked"),
                versionEntry("1.1.0", "inadmissible"),
                versionEntry("1.2.0", "unverified"),
                versionEntry("2.0.0-beta.1"),
            ],
        };

        const next = backfilledIntegrationIndex(previous, "demo", "1.2.0", "a".repeat(64));

        expect(next).toMatchObject({
            stable: "1.2.0",
            latest: "2.0.0-beta.1",
            versions: [
                { version: "1.0.0", status: "blocked" },
                { version: "1.1.0", status: "inadmissible" },
                { version: "1.2.0", verificationDigest: "a".repeat(64) },
                { version: "2.0.0-beta.1" },
            ],
        });
        expect(next.versions[2]?.status).toBeUndefined();

        const blocked = backfilledIntegrationIndex(previous, "demo", "1.0.0", "b".repeat(64));
        const inadmissible = backfilledIntegrationIndex(previous, "demo", "1.1.0", "c".repeat(64));
        expect(blocked.versions[0]).toMatchObject({
            status: "blocked",
            verificationDigest: "b".repeat(64),
        });
        expect(inadmissible.versions[1]).toMatchObject({
            status: "inadmissible",
            verificationDigest: "c".repeat(64),
        });
    });

    test("accepts only an exact monotone persisted-state prefix", () => {
        const fields = ["bundle", "compatibility", "verification", "decision", "index"] as const;
        for (let prefixLength = 0; prefixLength < fields.length; prefixLength += 1) {
            const state = Object.fromEntries(
                fields.map((field, index) => [field, index < prefixLength ? "exact" : "absent"]),
            ) as IntegrationVerificationBackfillState;
            expect(assertInitialIntegrationVerificationBackfillState(state)).toBe("pending");
        }
        expect(assertInitialIntegrationVerificationBackfillState(stateOf("exact"))).toBe("unchanged");
        expect(() =>
            assertInitialIntegrationVerificationBackfillState({
                ...stateOf("absent"),
                compatibility: "exact",
            }),
        ).toThrow(/partial state/u);
        expect(() =>
            assertInitialIntegrationVerificationBackfillState({
                ...stateOf("exact"),
                verification: "conflict",
            }),
        ).toThrow(/conflicts with existing immutable evidence/u);
    });
});

function versionEntry(version: string, status?: "blocked" | "inadmissible" | "unverified") {
    return {
        version,
        path: `versions/${version}`,
        definition: `versions/${version}/definition.json`,
        ...(status ? { status } : {}),
    };
}

function stateOf(value: "absent" | "exact" | "conflict"): IntegrationVerificationBackfillState {
    return { bundle: value, compatibility: value, verification: value, decision: value, index: value };
}
