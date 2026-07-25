import { describe, expect, test } from "bun:test";
import {
    IntegrationRepositoryContractError,
    runIntegrationInstallation,
    type ResolvedIntegrationPackageRoot,
} from "@bernouy/cms-integrations";
import { rerunDefinition } from "../definitions";
import {
    FIRST_DIGEST,
    FIRST_PACKAGE_ROOT,
    packageLifecycleContext,
    RecordingPackageResolver,
    resolvedPackage,
} from "./packageFixture";

describe("integration package resolver contract", () => {
    const invalidResults: Array<{
        name: string;
        mutate: (result: ResolvedIntegrationPackageRoot) => void;
    }> = [
        { name: "kind", mutate: (result) => void (result.kind = "other-kind") },
        { name: "version", mutate: (result) => void (result.version = "2.0.0") },
        { name: "digest", mutate: (result) => void (result.digest = "not-a-sha256") },
        { name: "root", mutate: (result) => void (result.root = "   ") },
        {
            name: "definition",
            mutate: (result) => {
                result.definition = rerunDefinition("1.0.0", "https://api.example.com/substituted/items");
            },
        },
    ];

    for (const invalid of invalidResults) {
        test(`rejects an invalid ${invalid.name} before side effects`, async () => {
            const context = packageLifecycleContext();
            const definition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
            const resolver = new RecordingPackageResolver(() => {
                const result = resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT);
                invalid.mutate(result);
                return result;
            });

            await expect(
                runIntegrationInstallation({
                    mode: "create",
                    deps: { sources: context.sources, secrets: context.secrets },
                    installations: context.installations,
                    packageResolver: resolver,
                    siteIntegrations: [definition],
                    dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
                }),
            ).rejects.toBeInstanceOf(IntegrationRepositoryContractError);

            expect(await context.installations.get(definition.kind)).toBeNull();
            expect(await context.sources.getAllSources()).toEqual([]);
        });
    }
});
