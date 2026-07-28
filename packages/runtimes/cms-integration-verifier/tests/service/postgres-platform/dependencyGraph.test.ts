import { describe, expect, test } from "bun:test";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { buildDependencyMatrixPlans } from "../../../src/sandbox/service/postgres/suites/dependencies/graph";
import type {
    LoadedCandidatePackage,
    LoadedDependencyPackage,
} from "../../../src/sandbox/service/postgres/suites/dependencies/types";

describe("PostgreSQL dependency matrix graph", () => {
    test("derives deterministic dependency-first order for both exact selections", () => {
        const candidate = candidatePackage(definition("candidate", [dependency("a", "^1.0.0")]));
        const packages = [
            loaded("a", "1.0.0", "minimum", [dependency("z", "^1.0.0")]),
            loaded("z", "1.0.0", "minimum"),
            loaded("a", "1.1.0", "stable", [dependency("z", "^1.0.0")]),
            loaded("z", "1.1.0", "stable"),
        ];

        const plans = buildDependencyMatrixPlans(candidate, packages);

        expect(plans.map((plan) => plan.selection)).toEqual(["minimum", "stable"]);
        expect(plans.map((plan) => plan.packages.map(({ kind, version }) => `${kind}@${version}`))).toEqual([
            ["z@1.0.0", "a@1.0.0"],
            ["z@1.1.0", "a@1.1.0"],
        ]);
    });

    test("rejects missing, extra, duplicate, cyclic, and out-of-range selections", () => {
        const candidate = candidatePackage(definition("candidate", [dependency("a", "^1.0.0")]));
        const valid = [loaded("a", "1.0.0", "minimum"), loaded("a", "1.1.0", "stable")];

        expect(() => buildDependencyMatrixPlans(candidate, valid.slice(1))).toThrow(/both minimum and stable/);
        expect(() => buildDependencyMatrixPlans(candidate, [...valid, loaded("extra", "1.0.0", "minimum")])).toThrow(
            /unreachable/,
        );
        expect(() => buildDependencyMatrixPlans(candidate, [...valid, loaded("a", "1.0.1", "minimum")])).toThrow(
            /more than once/,
        );
        expect(() =>
            buildDependencyMatrixPlans(candidate, [
                loaded("a", "1.0.0", "minimum", [dependency("a", "^1.0.0")]),
                valid[1]!,
            ]),
        ).toThrow(/cycle/);
        expect(() => buildDependencyMatrixPlans(candidate, [loaded("a", "2.0.0", "minimum"), valid[1]!])).toThrow(
            /outside its range/,
        );
    });

    test("does not invent execution for an absent optional dependency", () => {
        const candidate = candidatePackage(
            definition("candidate", [{ ...dependency("optional", "^1.0.0"), optional: true }]),
        );

        expect(buildDependencyMatrixPlans(candidate, [])).toEqual([]);
    });
});

function dependency(kind: string, versionRange: string) {
    return { name: kind, kind, versionRange };
}

function definition(kind: string, dependencies: readonly ReturnType<typeof dependency>[] = []): IntegrationDefinition {
    return { kind, label: kind, version: "1.0.0", inputs: [], dependencies };
}

function candidatePackage(value: IntegrationDefinition): LoadedCandidatePackage {
    return {
        kind: value.kind,
        version: value.version!,
        packageDigest: digest(value.kind, value.version!),
        root: "/candidate",
        definition: value,
    };
}

function loaded(
    kind: string,
    version: string,
    selection: "minimum" | "stable",
    dependencies: readonly ReturnType<typeof dependency>[] = [],
): LoadedDependencyPackage {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {},
    };
    return {
        selection,
        kind,
        version,
        packageDigest: digest(kind, version),
        envelope,
        root: `/${selection}/${kind}`,
        definition: { ...definition(kind, dependencies), version },
    };
}

function digest(kind: string, version: string): string {
    return `${kind}-${version}`.padEnd(64, "0").slice(0, 64);
}
