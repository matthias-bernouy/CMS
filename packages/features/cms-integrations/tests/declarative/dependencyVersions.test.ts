import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    parseIntegrationDefinition,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { resolveDependencyContext } from "cms-integrations/core/import/dependencies";
import { assertDefinitionUsable } from "cms-integrations/core/parsing/definition/definition";

describe("integration dependency versions", () => {
    test("parses the supported optional versionRange field", () => {
        const definition = parseIntegrationDefinition({
            kind: "consumer",
            label: "Consumer",
            inputs: [],
            dependencies: [{ name: "catalog", kind: "catalog", versionRange: "^1.2.0" }],
        });
        expect(definition.dependencies).toEqual([{ name: "catalog", kind: "catalog", versionRange: "^1.2.0" }]);
    });

    test("rejects empty and unsupported ranges while preserving legacy definitions", () => {
        expect(
            parseIntegrationDefinition({
                kind: "legacy",
                label: "Legacy",
                inputs: [],
                dependencies: [{ name: "catalog", kind: "catalog" }],
            }).dependencies,
        ).toEqual([{ name: "catalog", kind: "catalog" }]);

        for (const versionRange of ["", "1.x", ">=1.0.0", "^1.2"]) {
            expect(() =>
                parseIntegrationDefinition({
                    kind: "consumer",
                    label: "Consumer",
                    inputs: [],
                    dependencies: [{ name: "catalog", kind: "catalog", versionRange }],
                }),
            ).toThrow(/versionRange/);
        }
        expect(() => assertDefinitionUsable(consumer(""))).toThrow(/versionRange/);
    });

    test("accepts exact, caret, tilde, and bounded ranges", async () => {
        for (const [version, range] of [
            ["1.2.3", "1.2.3"],
            ["1.5.0", "^1.2.0"],
            ["1.2.8", "~1.2.0"],
            ["1.9.9", ">=1.2.0 <2.0.0"],
        ]) {
            const installations = await installedDependency(version!);
            const context = await resolveDependencyContext(consumer(range!), installations);
            expect(context.catalog?.id).toBe("catalog");
        }
    });

    test("rejects installed required or optional dependencies outside the range", async () => {
        const installations = await installedDependency("2.0.0");
        await expect(resolveDependencyContext(consumer("^1.2.0"), installations)).rejects.toThrow(
            /requires integration "catalog" version "\^1\.2\.0", but "2\.0\.0" is installed/,
        );
        await expect(resolveDependencyContext(consumer("^1.2.0", true), installations)).rejects.toThrow(
            /requires integration "catalog" version/,
        );
    });

    test("does not let a prerelease satisfy a stable range implicitly", async () => {
        const installations = await installedDependency("1.3.0-beta.1");
        await expect(resolveDependencyContext(consumer("^1.2.0"), installations)).rejects.toThrow(/1\.3\.0-beta\.1/);
    });

    test("allows an absent optional dependency but rejects an unversioned installed dependency", async () => {
        const absent = await resolveDependencyContext(
            consumer("^1.0.0", true),
            new InMemoryIntegrationInstallationRepository(),
        );
        expect(absent).toEqual({});

        const legacy = await installedDependency("unversioned");
        await expect(resolveDependencyContext(consumer("^1.0.0", true), legacy)).rejects.toThrow(/unversioned/);
    });
});

function consumer(versionRange: string, optional = false): IntegrationDefinition {
    return {
        kind: "consumer",
        label: "Consumer",
        inputs: [],
        dependencies: [{ name: "catalog", kind: "catalog", versionRange, ...(optional ? { optional } : {}) }],
    };
}

async function installedDependency(version: string): Promise<InMemoryIntegrationInstallationRepository> {
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create({
        id: "catalog",
        label: "Catalog",
        definitionVersion: version,
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [],
        runs: [],
    });
    return installations;
}
