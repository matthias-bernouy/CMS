import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import {
    importIntegration,
    parseIntegrationDefinition,
    type IntegrationConnectorDeployContext,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository, type Dashboard } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { writeSecretsWithRollback } from "cms-integrations/core/import/secretWrites";
import { DeleteFailingSecretStore, FailingCreateSourceRepository, sourceArtifact } from "./helpers";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("rejects plaintext interpolation of secret answers in artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "leaky",
            label: "Leaky",
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "API_KEY" }],
            artifacts: [{
                type: "source",
                source: {
                    id: "leaky",
                    meta: { name: "Leaky" },
                    endpoints: [{
                        endpointId: "list",
                        method: "GET",
                        targetUrl: "https://api.example.com/items",
                        params: [],
                        headers: [{ name: "authorization", source: { from: "static", value: "{{answers.apiKey}}" } }],
                    }],
                },
            }],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "leaky", answers: { apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/secret answer "apiKey"/);

        expect(await sources.getSource("urn:leaky")).toBeNull();
        expect(await secrets.get("API_KEY")).toBeNull();
    });

    test("rolls back created sources and secrets when a later source write fails", async () => {
        const innerSources = new InMemorySourceRepository();
        const sources = new FailingCreateSourceRepository(innerSources, "urn:two");
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "two-sources",
            label: "Two sources",
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "API_KEY" }],
            artifacts: [sourceArtifact("one"), sourceArtifact("two")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "two-sources", answers: { apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/create failed/);

        expect(await innerSources.getSource("urn:one")).toBeNull();
        expect(await secrets.get("API_KEY")).toBeNull();
    });

    test("imports bloc artifacts through the injected bloc importer", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const imported: unknown[] = [];
        const definition: IntegrationDefinition = {
            kind: "bloc-pack",
            label: "Bloc Pack",
            inputs: [],
            artifacts: [{
                type: "bloc",
                bloc: {
                    tag: "demo-card",
                    name: "Demo card",
                    group: "Content",
                    viewJS: `customElements.define("demo-card", class extends HTMLElement {});`,
                    source: {
                        "Bloc.ts": Buffer.from(`customElements.define("demo-card", class extends HTMLElement {});`).toString("base64"),
                    },
                },
            }],
        };

        const result = await importIntegration(
            {
                sources,
                secrets,
                blocs: {
                    importBloc: async (artifact) => {
                        imported.push(artifact);
                        return { id: artifact.tag, action: "created" };
                    },
                },
            },
            { kind: "bloc-pack", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "bloc", id: "demo-card", action: "created" }]);
        expect(imported).toEqual([{
            tag: "demo-card",
            name: "Demo card",
            group: "Content",
            viewJS: `customElements.define("demo-card", class extends HTMLElement {});`,
            source: {
                "Bloc.ts": Buffer.from(`customElements.define("demo-card", class extends HTMLElement {});`).toString("base64"),
            },
        }]);
    });

    test("imports function artifacts after their source dependencies", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "products",
            label: "Products",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "products",
                        meta: { name: "Products" },
                        endpoints: [
                            {
                                endpointId: "getProduct",
                                method: "GET",
                                targetUrl: "https://example.com/products",
                                params: [{ name: "productId", in: "query", type: "string", required: true }],
                                output: [{
                                    status: "200",
                                    body: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            ownerUserId: { type: "string" },
                                        },
                                    },
                                }],
                            },
                        ],
                    },
                },
                {
                    type: "function",
                    function: {
                        id: "readMyProduct",
                        method: "GET",
                        input: {
                            params: {
                                productId: { type: "string" },
                            },
                        },
                        steps: [
                            {
                                id: "product",
                                call: {
                                    source: "products",
                                    endpoint: "getProduct",
                                    params: { productId: "$input.params.productId" },
                                },
                            },
                            {
                                assert: {
                                    condition: { equals: ["$steps.product.ownerUserId", "$ctx.user.id"] },
                                    failure: { status: 403, error: "Not your product" },
                                },
                            },
                        ],
                        return: { body: "$steps.product" },
                    },
                },
            ],
        };

        const result = await importIntegration(
            { sources, functions, secrets },
            { kind: "products", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:products", action: "created" },
            { type: "function", id: "readMyProduct", action: "created" },
        ]);
        expect(await functions.getFunction("readMyProduct")).toMatchObject({ id: "readMyProduct" });
    });

    test("validates resolved declarative secret keys before writing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "bad-key",
            label: "Bad key",
            inputs: [
                { name: "id", label: "Id", type: "text", required: true },
                { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
            ],
            secrets: [{ input: "apiKey", key: "{{answers.id}}-token" }],
            artifacts: [sourceArtifact("bad-key")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "bad-key", answers: { id: "my service", apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/secret key must match/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:bad-key")).toBeNull();
    });

    test("parses dashboard select options and lookup field definitions", () => {
        const definition = parseIntegrationDefinition({
            kind: "delivery",
            label: "Delivery",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "delivery",
                        meta: { name: "Delivery" },
                        endpoints: [
                            {
                                endpointId: "createShipment",
                                method: "POST",
                                targetUrl: "https://example.com/shipments",
                                params: [],
                            },
                            {
                                endpointId: "relayPoints",
                                method: "GET",
                                targetUrl: "https://example.com/relay-points",
                                params: [
                                    { name: "country", in: "query", type: "string" },
                                    { name: "postalCode", in: "query", type: "string" },
                                    { name: "city", in: "query", type: "string" },
                                    { name: "limit", in: "query", type: "number" },
                                ],
                            },
                        ],
                    },
                },
                {
                    type: "dashboard",
                    dashboard: {
                        id: "delivery",
                        source: "delivery",
                        views: [{
                            widget: "w-detail",
                            id: "shipmentDetail",
                            source: { endpoint: "relayPoints", params: { country: "FR" }, itemPath: "item" },
                            actions: [{
                                id: "create",
                                label: "Create shipment",
                                placement: "primary",
                                endpoint: { endpoint: "createShipment" },
                            }],
                            main: [{
                                id: "shipment",
                                title: "Shipment",
                                fields: [
                                    {
                                        id: "recipientCountry",
                                        label: "Recipient country",
                                        path: "recipientCountry",
                                        type: "select",
                                        options: ["FR"],
                                        required: true,
                                    },
                                    {
                                        id: "deliveryRelayNumber",
                                        label: "Pickup point",
                                        path: "deliveryRelayNumber",
                                        type: "combobox",
                                        required: true,
                                        lookup: {
                                            endpoint: "relayPoints",
                                            params: {
                                                country: "FR",
                                                postalCode: "$field.recipientPostalCode",
                                                city: "$field.recipientCity",
                                                limit: "10",
                                            },
                                            itemsPath: "items",
                                            valuePath: "number",
                                            labelPath: "name",
                                            subtitlePath: "city",
                                            descriptionPaths: ["addressLine1", "postalCode", "city"],
                                        },
                                    },
                                    {
                                        id: "options",
                                        label: "Options",
                                        path: "options",
                                        type: "tokens",
                                        allowCustom: true,
                                        visibleWhen: {
                                            field: "recipientCountry",
                                            equals: "FR",
                                        },
                                    },
                                ],
                            }],
                        }],
                    },
                },
            ],
        });

        expect(definition.artifacts?.[1]).toEqual({
            type: "dashboard",
            dashboard: {
                id: "delivery",
                source: "delivery",
                views: [{
                    widget: "w-detail",
                    id: "shipmentDetail",
                    source: { endpoint: "relayPoints", params: { country: "FR" }, itemPath: "item" },
                    actions: [{
                        id: "create",
                        label: "Create shipment",
                        placement: "primary",
                        endpoint: { endpoint: "createShipment" },
                    }],
                    main: [{
                        id: "shipment",
                        title: "Shipment",
                        fields: [
                            {
                                id: "recipientCountry",
                                label: "Recipient country",
                                path: "recipientCountry",
                                type: "select",
                                options: [{ value: "FR", label: "FR" }],
                                required: true,
                            },
                            {
                                id: "deliveryRelayNumber",
                                label: "Pickup point",
                                path: "deliveryRelayNumber",
                                type: "combobox",
                                required: true,
                                lookup: {
                                    endpoint: "relayPoints",
                                    params: {
                                        country: "FR",
                                        postalCode: "$field.recipientPostalCode",
                                        city: "$field.recipientCity",
                                        limit: "10",
                                    },
                                    itemsPath: "items",
                                    valuePath: "number",
                                    labelPath: "name",
                                    subtitlePath: "city",
                                    descriptionPaths: ["addressLine1", "postalCode", "city"],
                                },
                            },
                            {
                                id: "options",
                                label: "Options",
                                path: "options",
                                type: "tokens",
                                allowCustom: true,
                                visibleWhen: {
                                    field: "recipientCountry",
                                    equals: "FR",
                                },
                            },
                        ],
                    }],
                }],
            },
        });
    });
    test("rejects duplicate source urns within one import before writing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "duplicate-sources",
            label: "Duplicate Sources",
            inputs: [],
            artifacts: [sourceArtifact("same"), sourceArtifact("same")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "duplicate-sources", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/urn:same/);

        expect(await sources.getSource("urn:same")).toBeNull();
    });

    test("imports dashboards declared for sources owned by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "source-dashboard",
            label: "Source dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        const result = await importIntegration(
            { sources, secrets, dashboards },
            { kind: "source-dashboard", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:items", action: "created" },
            { type: "dashboard", id: "items-dashboard", action: "created" },
        ]);
        expect(await dashboards.getDashboard("items-dashboard")).toEqual(dashboardArtifact("items-dashboard", "items").dashboard);
    });

    test("rejects dashboards targeting sources not declared by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "foreign-dashboard",
            label: "Foreign dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("owned"),
                dashboardArtifact("bad-dashboard", "foreign"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "foreign-dashboard", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/references source "foreign" not declared by this integration/);

        expect(await sources.getSource("urn:owned")).toBeNull();
        expect(await dashboards.getDashboard("bad-dashboard")).toBeNull();
    });

    test("rolls back sources when dashboard writes fail", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new FailingCreateDashboardRepository("items-dashboard");
        const definition: IntegrationDefinition = {
            kind: "dashboard-fails",
            label: "Dashboard fails",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "dashboard-fails", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/dashboard create failed/);

        expect(await sources.getSource("urn:items")).toBeNull();
        expect(await dashboards.getDashboard("items-dashboard")).toBeNull();
    });

    test("deploys connectors before resolving connector-backed artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        let observed: {
            deployment: IntegrationConnectorDeployment;
            context: IntegrationConnectorDeployContext;
        } | null = null;
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(deployment, context) {
                observed = { deployment, context };
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                    resources: [
                        { type: "schema", id: "schema.sql", action: "applied" },
                        { type: "function", id: "cms-connector", action: "deployed" },
                        { type: "secret", id: "CMS_API_KEY", action: "set" },
                    ],
                };
            },
        };
        const definition: IntegrationDefinition = connectorBackedDefinition();

        const result = await importIntegration(
            { sources, secrets, connectorDeployers: [deployer] },
            { kind: "connector-source", answers: { id: "main" }, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:main", action: "created" }]);
        expect(result.secrets).toEqual([{ input: "cmsApiKey", key: "CONNECTOR_MAIN_API_KEY", action: "created" }]);
        expect(result.connectors?.[0]).toEqual({
            provider: "supabase",
            outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            resources: [
                { type: "schema", id: "schema.sql", action: "applied" },
                { type: "function", id: "cms-connector", action: "deployed" },
                { type: "secret", id: "CMS_API_KEY", action: "set" },
            ],
        });
        const generated = await secrets.get("CONNECTOR_MAIN_API_KEY");
        expect(generated?.startsWith("cms_")).toBe(true);
        expect(observed?.deployment).toEqual({
            integrationKind: "connector-source",
            version: "1.0.0",
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: [],
            schemas: [{ path: "schema.sql" }],
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                configPath: "supabase.config.toml",
                secrets: { CMS_API_KEY: generated },
            }],
        });
        expect(observed?.context.generated.cmsApiKey).toBe(generated);
        const installed = await sources.getSource("urn:main");
        expect(installed?.endpoints[0]?.targetUrl).toBe("https://project.supabase.co/functions/v1/cms-connector/health");
        expect(installed?.endpoints[0]?.headers?.[0]?.source).toEqual({
            from: "secret",
            ref: "${CONNECTOR_MAIN_API_KEY}",
            prefix: "Bearer ",
        });
    });

    test("passes secret input values to connector function secrets without leaking them", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        let observed: IntegrationConnectorDeployment | null = null;
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(deployment) {
                observed = deployment;
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                };
            },
        };

        const result = await importIntegration(
            { sources, secrets, connectorDeployers: [deployer] },
            {
                kind: "connector-secret-source",
                answers: { id: "main", privateKey: "mr_private", publicValue: "visible" },
                options: {},
            },
            [connectorSecretBackedDefinition()],
        );

        expect(observed?.functions[0]?.secrets).toEqual({
            PRIVATE_KEY: "mr_private",
            PUBLIC_VALUE: "visible",
        });
        expect(result.secrets).toEqual([{ input: "privateKey", key: "CONNECTOR_MAIN_PRIVATE_KEY", action: "created" }]);
        expect(await secrets.get("CONNECTOR_MAIN_PRIVATE_KEY")).toBe("mr_private");
        expect(JSON.stringify(result)).not.toContain("mr_private");
    });

    test("rolls back generated secrets when a connector deployer is missing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();

        await expect(importIntegration(
            { sources, secrets },
            { kind: "connector-source", answers: { id: "main" }, options: {} },
            [connectorBackedDefinition()],
        )).rejects.toThrow(/connector deployer "supabase" not configured/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:main")).toBeNull();
    });
});

describe("@bernouy/cms-integrations secret rollback", () => {
    test("continues restoring secrets when one rollback operation fails", async () => {
        const secrets = new DeleteFailingSecretStore();
        await secrets.set("A", "old");

        await expect(writeSecretsWithRollback(
            secrets,
            [{ key: "A", value: "new" }, { key: "B", value: "new" }],
            async () => {
                throw new Error("boom");
            },
        )).rejects.toThrow("boom");

        expect(await secrets.get("A")).toBe("old");
        expect(await secrets.get("B")).toBe("new");
    });
});

function dashboardArtifact(id: string, source: string) {
    return {
        type: "dashboard" as const,
        dashboard: {
            id,
            source,
            views: [
                {
                    widget: "w-table" as const,
                    id: "itemsTable",
                    source: { endpoint: "list", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "ID", path: "id" }],
                },
            ],
        },
    };
}

class FailingCreateDashboardRepository extends InMemoryDashboardRepository {
    constructor(private readonly failId: string) {
        super();
    }

    override createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        if (dashboard.id === this.failId) throw new Error(`dashboard create failed for ${dashboard.id}`);
        return super.createDashboard(dashboard);
    }
}

function connectorBackedDefinition(): IntegrationDefinition {
    return {
        kind: "connector-source",
        label: "Connector Source",
        version: "1.0.0",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        generatedSecrets: [{
            name: "cmsApiKey",
            key: "CONNECTOR_{{env answers.id}}_API_KEY",
            bytes: 16,
            prefix: "cms_",
        }],
        connectors: [{
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: [],
            schemas: [{ path: "schema.sql" }],
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                configPath: "supabase.config.toml",
                secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
            }],
        }],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Connector source" },
                endpoints: [{
                    endpointId: "health",
                    method: "GET",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-connector/health",
                    params: [],
                    headers: [{
                        name: "authorization",
                        source: { from: "secret", ref: "{{secrets.cmsApiKey}}", prefix: "Bearer " },
                    }],
                }],
            },
        }],
    };
}

function connectorSecretBackedDefinition(): IntegrationDefinition {
    return {
        kind: "connector-secret-source",
        label: "Connector Secret Source",
        version: "1.0.0",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "privateKey", label: "Private key", type: "password", required: true, secret: true },
            { name: "publicValue", label: "Public value", type: "text", required: true },
        ],
        secrets: [{ input: "privateKey", key: "CONNECTOR_{{env answers.id}}_PRIVATE_KEY" }],
        connectors: [{
            provider: "supabase",
            root: "connectors/supabase",
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                secrets: {
                    PRIVATE_KEY: "{{connectorSecrets.privateKey}}",
                    PUBLIC_VALUE: "{{answers.publicValue}}",
                },
            }],
        }],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Connector secret source" },
                endpoints: [{
                    endpointId: "health",
                    method: "GET",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-connector/health",
                    params: [],
                    headers: [{
                        name: "authorization",
                        source: { from: "secret", ref: "{{secrets.privateKey}}", prefix: "Bearer " },
                    }],
                }],
            },
        }],
    };
}
