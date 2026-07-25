import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";
import { rerunDefinition } from "../definitions";
import {
    FIRST_DIGEST,
    FIRST_PACKAGE_ROOT,
    packageLifecycleContext,
    RecordingPackageResolver,
    resolvedPackage,
} from "./packageFixture";

describe("legacy integration package provenance", () => {
    test("adds a first digest after an exact rerun while preserving the stored snapshot", async () => {
        const context = packageLifecycleContext();
        const definition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const created = await createLegacy(context, definition);
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT),
        );

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: definition.kind,
            packageResolver: resolver,
        });

        expect(resolver.requests[0]?.expectedDigest).toBeUndefined();
        expect(resolver.requests[0]?.expectedDefinition).toEqual(created.installation.definitionSnapshot);
        expect(resolver.requests[0]?.allowEmbeddedFallback).toBeTrue();
        expect(result.installation.definitionSnapshot).toEqual(created.installation.definitionSnapshot);
        expect(result.installation.packageDigest).toBe(FIRST_DIGEST);
    });

    test("requires a resolver for an already pinned rerun before entering pending", async () => {
        const context = packageLifecycleContext();
        const definition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT),
        );
        await runIntegrationInstallation({
            mode: "create",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            packageResolver: resolver,
            siteIntegrations: [definition],
            dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
        });
        const before = await context.installations.get(definition.kind);

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources: context.sources, secrets: context.secrets },
                installations: context.installations,
                integrationId: definition.kind,
            }),
        ).rejects.toThrow(/resolver is required/);

        expect(await context.installations.get(definition.kind)).toEqual(before);
    });

    test("keeps direct unpinned upgrades compatible when no resolver is injected", async () => {
        const context = packageLifecycleContext();
        const installed = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const target = rerunDefinition("1.1.0", "https://api.example.com/v2/items");
        await createLegacy(context, installed);

        const result = await runIntegrationInstallation({
            mode: "upgrade",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: installed.kind,
            targetDefinition: target,
        });

        expect(result.installation.definitionVersion).toBe("1.1.0");
        expect(result.installation.definitionSnapshot?.version).toBe("1.1.0");
        expect(result.installation.packageDigest).toBeUndefined();
    });
});

function createLegacy(
    context: ReturnType<typeof packageLifecycleContext>,
    definition: ReturnType<typeof rerunDefinition>,
) {
    return runIntegrationInstallation({
        mode: "create",
        deps: { sources: context.sources, secrets: context.secrets },
        installations: context.installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
    });
}
