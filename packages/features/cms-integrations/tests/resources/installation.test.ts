import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type CollectionIntegrationDefinition,
    type IntegrationBlocArtifact,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { collectionDefinition, sourceDefinition } from "./fixtures";

describe("collection installation resources", () => {
    test("persists selection, updates catalogue availability, and keeps new upgrade resources inactive", async () => {
        const installations = new InMemoryIntegrationInstallationRepository();
        const imported: IntegrationBlocArtifact[] = [];
        const deps = {
            sources: new InMemorySourceRepository(),
            secrets: new InMemorySecretStore(),
            installations,
            blocs: {
                importBloc: async (artifact: IntegrationBlocArtifact) => {
                    imported.push(artifact);
                    return { id: artifact.tag, action: "created" as const };
                },
            },
        };
        const original = collectionDefinition();
        const created = await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [original, sourceDefinition()],
            dto: {
                kind: "ulvia",
                answers: {},
                options: {},
                resources: ["ulvia/blocs/basic-paragraph"],
            },
        });

        expect(created.installation.activeResources).toEqual(["ulvia/blocs/basic-paragraph"]);
        expect(imported.map(({ tag, catalogue }) => [tag, catalogue])).toEqual([
            ["basic-paragraph", "active"],
            ["commerce-offer-list", "inactive"],
        ]);

        imported.length = 0;
        const upgradedDefinition = withAdditionalBloc(original);
        const upgraded = await runIntegrationInstallation({
            mode: "upgrade",
            deps,
            installations,
            integrationId: "ulvia",
            targetDefinition: upgradedDefinition,
            body: { version: "1.1.0" },
            siteIntegrations: [sourceDefinition()],
        });

        expect(upgraded.installation.activeResources).toEqual(["ulvia/blocs/basic-paragraph"]);
        expect(imported.map(({ tag, catalogue }) => [tag, catalogue])).toEqual([
            ["basic-paragraph", "active"],
            ["commerce-offer-list", "inactive"],
            ["basic-heading", "inactive"],
        ]);
    });

    test("changes active resources only on an explicit rerun selection", async () => {
        const installations = new InMemoryIntegrationInstallationRepository();
        const imported: IntegrationBlocArtifact[] = [];
        const definition = collectionDefinition();
        const deps = {
            sources: new InMemorySourceRepository(),
            secrets: new InMemorySecretStore(),
            installations,
            blocs: {
                importBloc: async (artifact: IntegrationBlocArtifact) => {
                    imported.push(artifact);
                    return { id: artifact.tag, action: "updated" as const };
                },
            },
        };
        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [definition, sourceDefinition()],
            dto: { kind: "ulvia", answers: {}, options: {}, resources: [] },
        });
        const rerun = await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            integrationId: "ulvia",
            body: { resources: ["ulvia/blocs/commerce-offer-list"] },
            siteIntegrations: [sourceDefinition()],
        });

        expect(rerun.installation.activeResources).toEqual(["ulvia/blocs/commerce-offer-list"]);
        expect(imported.slice(-2).map(({ tag, catalogue }) => [tag, catalogue])).toEqual([
            ["basic-paragraph", "inactive"],
            ["commerce-offer-list", "active"],
        ]);
    });
});

function withAdditionalBloc(definition: CollectionIntegrationDefinition): CollectionIntegrationDefinition {
    return {
        ...definition,
        version: "1.1.0",
        resources: [
            ...definition.resources,
            {
                id: "ulvia/blocs/basic-heading",
                type: "bloc",
                artifact: "basic-heading",
                category: "content",
            },
        ],
        artifacts: [
            ...(definition.artifacts ?? []),
            {
                type: "bloc",
                bloc: { tag: "basic-heading", name: "Heading", compositionHTML: "<h2></h2>" },
            },
        ],
    };
}
