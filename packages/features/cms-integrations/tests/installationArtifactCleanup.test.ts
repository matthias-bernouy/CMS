import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { SuccessReplaceFailingIntegrationInstallationRepository } from "./helpers";

describe("@bernouy/cms-integrations obsolete artifact cleanup", () => {
    test("deletes source and function artifacts removed by a successful rerun", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = definition("cleanup", "1.0.0", true);
        const current = definition("cleanup", "2.0.0", false);

        await install(previous, { sources, functions, secrets, installations });
        const result = await rerun(current, { sources, functions, secrets, installations });

        expect(await sources.getSource("urn:legacy-source")).toBeNull();
        expect(await functions.getFunction("legacyFunction")).toBeNull();
        expect(result.installation.artifacts).toEqual([]);
        expect(result.installation.status).toBe("success");
    });

    test("keeps an obsolete artifact still tracked by another installation", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const first = functionDefinition("first", "1.0.0", true);
        const second = functionDefinition("second", "1.0.0", true);

        await install(first, { sources, functions, secrets, installations });
        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, functions, secrets },
            installations,
            siteIntegrations: [second],
            dto: { kind: second.kind, answers: {}, options: { force: true } },
        });
        await rerun(functionDefinition("first", "2.0.0", false), {
            sources,
            functions,
            secrets,
            installations,
        });

        expect(await functions.getFunction("legacyFunction")).not.toBeNull();
        expect((await installations.get("first"))?.artifacts).toEqual([]);
        expect((await installations.get("second"))?.artifacts).toEqual([
            { type: "function", id: "legacyFunction", action: "updated" },
        ]);
    });

    test("cleans every repository-backed artifact type", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const dashboards = new InMemoryDashboardRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const relations = new InMemoryRelationRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = runtimeArtifactsDefinition("1.0.0", true);
        const current = runtimeArtifactsDefinition("2.0.0", false);
        const deps = { sources, functions, triggers, dashboards, sourceOverlays, relations, secrets };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [previous],
            dto: { kind: previous.kind, answers: {}, options: {} },
        });
        await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            integrationId: current.kind,
            siteIntegrations: [current],
        });

        expect(await sources.getSource("urn:products")).toBeNull();
        expect(await sources.getSource("urn:offers")).toBeNull();
        expect(await functions.getFunction("syncOffers")).toBeNull();
        expect(await triggers.getTrigger("sync-offers")).toBeNull();
        expect(await dashboards.getDashboard("products")).toBeNull();
        expect(await sourceOverlays.getOverlay("product-offers-fields")).toBeNull();
        expect(await relations.getRelation("product-offers")).toBeNull();
        expect(await relations.getDashboardRelationProjection("products:productDetail:product-offers")).toBeNull();
    });

    test("restores deleted artifacts when successful installation persistence fails", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new SuccessReplaceFailingIntegrationInstallationRepository();
        const previous = definition("cleanup", "1.0.0", true);
        const current = definition("cleanup", "2.0.0", false);

        await install(previous, { sources, functions, secrets, installations });
        await expect(rerun(current, { sources, functions, secrets, installations }))
            .rejects.toThrow(/installation replace failed/);

        expect(await sources.getSource("urn:legacy-source")).not.toBeNull();
        expect(await functions.getFunction("legacyFunction")).not.toBeNull();
        const installation = await installations.get("cleanup");
        expect(installation?.status).toBe("failed");
        expect(installation?.artifacts.map(artifact => [artifact.type, artifact.id])).toEqual([
            ["source", "urn:legacy-source"],
            ["function", "legacyFunction"],
        ]);
    });

    test("fails safely when an obsolete bloc cannot be deleted transactionally", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = blocDefinition("1.0.0", true);
        const current = blocDefinition("2.0.0", false);
        const deps = {
            sources,
            secrets,
            blocs: {
                async importBloc(artifact: { tag: string }) {
                    return { id: artifact.tag, action: "created" as const };
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [previous],
            dto: { kind: previous.kind, answers: {}, options: {} },
        });
        await expect(runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            integrationId: current.kind,
            siteIntegrations: [current],
        })).rejects.toThrow(/bloc deletion is not supported/);

        const installation = await installations.get("bloc-cleanup");
        expect(installation?.status).toBe("failed");
        expect(installation?.artifacts).toEqual([
            { type: "bloc", id: "legacy-card", action: "created" },
        ]);
    });
});

type Repositories = {
    sources: InMemorySourceRepository;
    functions: InMemoryFunctionRepository;
    secrets: InMemorySecretStore;
    installations: InMemoryIntegrationInstallationRepository;
};

function install(definition: IntegrationDefinition, repositories: Repositories) {
    return runIntegrationInstallation({
        mode: "create",
        deps: {
            sources: repositories.sources,
            functions: repositories.functions,
            secrets: repositories.secrets,
        },
        installations: repositories.installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: {}, options: {} },
    });
}

function rerun(definition: IntegrationDefinition, repositories: Repositories) {
    return runIntegrationInstallation({
        mode: "rerun",
        deps: {
            sources: repositories.sources,
            functions: repositories.functions,
            secrets: repositories.secrets,
        },
        installations: repositories.installations,
        integrationId: definition.kind,
        siteIntegrations: [definition],
    });
}

function definition(kind: string, version: string, includeArtifacts: boolean): IntegrationDefinition {
    return {
        kind,
        label: "Cleanup",
        version,
        inputs: [],
        ...(includeArtifacts ? {
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "legacy-source",
                        meta: { name: "Legacy source" },
                        endpoints: [{
                            endpointId: "read",
                            method: "GET",
                            targetUrl: "https://example.com/legacy",
                            params: [],
                            output: [{ status: "200", body: { type: "object" } }],
                        }],
                    },
                },
                legacyFunctionArtifact(),
            ],
        } : {}),
    };
}

function functionDefinition(kind: string, version: string, includeArtifact: boolean): IntegrationDefinition {
    return {
        kind,
        label: kind,
        version,
        inputs: [],
        ...(includeArtifact ? { artifacts: [legacyFunctionArtifact()] } : {}),
    };
}

function legacyFunctionArtifact() {
    return {
        type: "function" as const,
        function: {
            id: "legacyFunction",
            method: "POST" as const,
            steps: [],
            return: { body: { ok: true } },
        },
    };
}

function runtimeArtifactsDefinition(version: string, includeArtifacts: boolean): IntegrationDefinition {
    return {
        kind: "runtime-cleanup",
        label: "Runtime cleanup",
        version,
        inputs: [],
        ...(includeArtifacts ? { artifacts: runtimeArtifacts() } : {}),
    };
}

function runtimeArtifacts(): NonNullable<IntegrationDefinition["artifacts"]> {
    return [
        {
            type: "source",
            source: {
                id: "products",
                meta: { name: "Products" },
                endpoints: [{
                    endpointId: "product",
                    method: "GET",
                    targetUrl: "https://api.example.com/products",
                    params: [],
                    output: [{
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                item: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        title: { type: "string" },
                                    },
                                },
                            },
                        },
                    }],
                }],
            },
        },
        {
            type: "source",
            source: {
                id: "offers",
                meta: { name: "Offers" },
                endpoints: [{
                    endpointId: "offers",
                    method: "GET",
                    targetUrl: "https://api.example.com/offers",
                    params: [
                        { name: "productId", in: "query", type: "string" },
                        { name: "limit", in: "query", type: "number" },
                        { name: "offset", in: "query", type: "number" },
                    ],
                    output: [{
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                items: {
                                    type: "array",
                                    items: { type: "object", properties: { id: { type: "string" } } },
                                },
                            },
                        },
                    }],
                }],
            },
        },
        {
            type: "function",
            function: {
                id: "syncOffers",
                method: "POST",
                steps: [],
                return: { status: 204 },
            },
        },
        {
            type: "trigger",
            trigger: {
                id: "sync-offers",
                event: { kind: "endpoint", source: "products", endpoint: "product", phase: "response" },
                function: { id: "syncOffers", params: { productId: "$response.body.id" } },
            },
        },
        {
            type: "sourceOverlay",
            overlay: {
                id: "product-offers-fields",
                sourceId: "products",
                output: [{ endpointId: "product" }],
                fields: [{ id: "offerCount", label: "Offer count", type: "number" }],
            },
        },
        {
            type: "dashboard",
            dashboard: {
                id: "products",
                source: "products",
                views: [{
                    widget: "w-detail",
                    id: "productDetail",
                    source: { endpoint: "product", itemPath: "item" },
                    main: [{
                        id: "details",
                        title: "Details",
                        fields: [{ id: "title", label: "Title", type: "text", path: "title" }],
                    }],
                }],
            },
        },
        {
            type: "relation",
            relation: {
                id: "product-offers",
                from: { sourceId: "products", idPath: "id" },
                to: { sourceId: "offers", idPath: "id" },
                cardinality: "many",
                binding: {
                    kind: "reference",
                    endpoint: { sourceId: "offers", endpointId: "offers" },
                    params: { productId: "$from.id" },
                },
                page: { itemsPath: "items", limitParam: "limit", offsetParam: "offset" },
            },
        },
        {
            type: "dashboardRelation",
            projection: {
                type: "dashboardRelation",
                relationId: "product-offers",
                dashboardId: "products",
                viewId: "productDetail",
                widget: "table",
            },
        },
    ];
}

function blocDefinition(version: string, includeArtifact: boolean): IntegrationDefinition {
    return {
        kind: "bloc-cleanup",
        label: "Bloc cleanup",
        version,
        inputs: [],
        ...(includeArtifact ? {
            artifacts: [{
                type: "bloc",
                bloc: {
                    tag: "legacy-card",
                    name: "Legacy card",
                    viewJS: "customElements.define('legacy-card', class extends HTMLElement {});",
                },
            }],
        } : {}),
    };
}
