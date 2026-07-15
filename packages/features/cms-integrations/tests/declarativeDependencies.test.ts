import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { resolveDependencyContext } from "cms-integrations/core/import/dependencies";
import { resolveTemplate, type TemplateContext } from "cms-integrations/core/templates";
import { sourceArtifact } from "./helpers";

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

        await expect(importIntegration(
            { sources, secrets, installations },
            { kind: "products-offers-link", answers: { apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/requires integration "offers" to be installed/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:link")).toBeNull();
    });

    test("resolves installed dependency answers and sourceId in templates", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        await installations.create({
            id: "products",
            label: "Products",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: { id: "catalog", public: true },
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: "urn:catalog", action: "created" }],
            runs: [],
        });
        const definition: IntegrationDefinition = {
            kind: "link",
            label: "Link",
            dependencies: [{ name: "products", kind: "products" }],
            inputs: [],
            artifacts: [{
                type: "source",
                source: {
                    id: "{{dependencies.products.sourceId}}-link",
                    meta: { name: "{{dependencies.products.answers.id}}" },
                    endpoints: [{
                        endpointId: "status",
                        method: "GET",
                        targetUrl: "https://api.example.com/{{dependencies.products.id}}/{{dependencies.products.answers.public}}",
                        params: [],
                    }],
                },
            }],
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
        await installations.create({
            id: "products",
            label: "Products",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: {
                id: "catalog",
                cmsApiKey: "legacy-ref-secret",
                legacyPassword: "legacy-password",
            },
            secretRefs: { cmsApiKey: "PRODUCTS_API_KEY" },
            secretInputs: [],
            definitionSnapshot: {
                kind: "products",
                label: "Products",
                inputs: [{
                    name: "legacyPassword",
                    label: "Legacy password",
                    type: "password",
                    required: true,
                    secret: true,
                }],
            },
            artifacts: [{ type: "source", id: "urn:catalog", action: "created" }],
            runs: [],
        });
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
            expect(() => resolveTemplate(
                `{{dependencies.products.${namespace}.cmsApiKey}}`,
                context,
            )).toThrow(/dependency secrets are not accessible/);
        }
    });
});
