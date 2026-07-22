import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { resolveDependencyContext } from "cms-integrations/core/import/dependencies";
import { resolveTemplate, type TemplateContext } from "cms-integrations/core/definitions/templates";
import { BAN_DEFINITION, BAN_SOURCE, sourceArtifact } from "../helpers";
import { installLegacySecretDependency, installProductsDependency } from "./dependencyFixtures";

describe("@bernouy/cms-integrations dependencies", () => {
    test("rejects missing required dependencies before writing secrets", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const definition: IntegrationDefinition = {
            kind: "products-offers-link",
            label: "Products offers link",
            dependencies: [{ name: "offers", kind: "offers" }],
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "LINK_API_KEY" }],
            artifacts: [sourceArtifact("link")],
        };

        await expect(
            importIntegration(
                { sources, secrets, installations },
                { kind: "products-offers-link", answers: { apiKey: "secret" }, options: {} },
                [definition],
            ),
        ).rejects.toThrow(/requires integration "offers" to be installed/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:link")).toBeNull();
    });

    test("resolves installed dependency answers and sourceId in templates", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        await installProductsDependency(installations);
        const definition: IntegrationDefinition = {
            kind: "link",
            label: "Link",
            dependencies: [{ name: "products", kind: "products" }],
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "{{dependencies.products.sourceId}}-link",
                        meta: { name: "{{dependencies.products.answers.id}}" },
                        endpoints: [
                            {
                                endpointId: "status",
                                method: "GET",
                                targetUrl:
                                    "https://api.example.com/{{dependencies.products.id}}/{{dependencies.products.answers.public}}",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                            },
                        ],
                    },
                },
            ],
        };

        const result = await importIntegration(
            { sources, secrets, installations },
            { kind: "link", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:catalog-link", action: "created" }]);
        const source = await sources.getSource("urn:catalog-link");
        expect(source?.meta?.name).toBe("catalog");
        expect(source?.endpoints[0]?.targetUrl).toBe("https://api.example.com/products/true");
    });

    test("never exposes dependency secrets to templates", async () => {
        const installations = new InMemoryIntegrationInstallationRepository();
        await installLegacySecretDependency(installations);
        const definition: IntegrationDefinition = {
            kind: "consumer",
            label: "Consumer",
            dependencies: [{ name: "products", kind: "products" }],
            inputs: [],
        };
        const dependencies = await resolveDependencyContext(definition, installations);
        expect(dependencies.products).toEqual({
            id: "products",
            answers: { id: "catalog" },
            sourceId: "catalog",
        });
        const context: TemplateContext = {
            answers: {},
            secrets: {},
            dependencies,
        };

        for (const namespace of ["secrets", "connectorSecrets"]) {
            expect(() => resolveTemplate(`{{dependencies.products.${namespace}.cmsApiKey}}`, context)).toThrow(
                /dependency secrets are not accessible/,
            );
        }
    });

    test("imports dashboards backed by installed dependency endpoints", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        await sources.createSource(BAN_SOURCE);
        await installations.create({
            id: "ban",
            label: "BAN",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: "urn:ban", action: "created" }],
            runs: [],
        });
        const definition: IntegrationDefinition = {
            ...structuredClone(BAN_DEFINITION),
            kind: "ban-dashboard",
            label: "BAN dashboard",
            dependencies: [{ name: "ban", kind: "ban" }],
            artifacts: BAN_DEFINITION.artifacts?.filter((artifact) => artifact.type === "dashboard"),
        };

        const result = await importIntegration(
            { sources, secrets, dashboards, installations },
            { kind: "ban-dashboard", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "dashboard", id: "ban-addresses", action: "created" }]);
        expect(await dashboards.getDashboard("ban-addresses")).not.toBeNull();
    });
});
