import { InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import type {
    IntegrationDefinition,
    IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";

export const TEST_SECRET_SOURCE_DEFINITION: IntegrationDefinition = {
    kind: "test-secret-source",
    label: "Test secret source",
    version: "1.0.0",
    category: "Test",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true, defaultValue: "test-source" },
        { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
    ],
    secrets: [
        { input: "apiKey", key: "TEST_SOURCE_{{env answers.id}}_API_KEY" },
    ],
    artifacts: [
        {
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Test secret source", icon: "key" },
                endpoints: [
                    {
                        endpointId: "listItems",
                        method: "GET",
                        targetUrl: "https://api.example.com/items",
                        params: [],
                        headers: [
                            {
                                name: "authorization",
                                source: { from: "secret", ref: "{{secrets.apiKey}}", prefix: "Bearer " },
                            },
                        ],
                    },
                ],
            },
        },
    ],
};

export function makeCms(siteIntegrations: IntegrationDefinition[] = [TEST_SECRET_SOURCE_DEFINITION]) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    const functions = new InMemoryFunctionRepository();
    const integrationInstallations = new InMemoryIntegrationInstallationRepository();
    const integrationCatalog = integrationDefinitionRepository(siteIntegrations);
    const repository = {
        getBlocsList: async () => [],
    };
    const cms = {
        repository,
        sources,
        secrets,
        dashboards,
        functions,
        integrationCatalog,
        integrationInstallations,
    };
    return { cms: cms as any, repository, sources, secrets, dashboards, functions, integrationInstallations, integrationCatalog };
}

export function integrationDefinitionRepository(
    definitions: IntegrationDefinition[],
): IntegrationDefinitionRepository {
    return {
        list: async () => definitions.map(definition => ({
            kind: definition.kind,
            label: definition.label,
            ...(definition.version ? { stable: definition.version, latest: definition.version } : {}),
            versions: definition.version ? [definition.version] : [],
        })),
        getIndex: async () => null,
        listVersions: async () => [],
        get: async (kind: string, version?: string) =>
            definitions.find(definition =>
                definition.kind === kind && (!version || definition.version === version)
            ) ?? null,
    };
}

export function postImport(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/integrations/import", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

export function getInstallations(id?: string) {
    const url = id
        ? `http://localhost/cms/api/integrations/installations?id=${encodeURIComponent(id)}`
        : "http://localhost/cms/api/integrations/installations";
    return new Request(url);
}

export function postRerun(id?: string, body?: Record<string, unknown>) {
    const query = id ? `?id=${encodeURIComponent(id)}` : "";
    return new Request(`http://localhost/cms/api/integrations/installations/rerun${query}`, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { "content-type": "application/json" },
    });
}

export function manualSourceDefinition(): IntegrationDefinition {
    return {
        kind: "manual-source",
        label: "Manual source",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "targetUrl", label: "Target URL", type: "url", required: true },
        ],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Manual source" },
                endpoints: [{
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "{{answers.targetUrl}}",
                    params: [],
                }],
            },
        }],
    };
}

export function sourceWithFunctionDefinition(): IntegrationDefinition {
    return {
        kind: "function-source",
        label: "Function source",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "targetUrl", label: "Target URL", type: "url", required: true },
        ],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Function source" },
                    endpoints: [{
                        endpointId: "read",
                        method: "GET",
                        targetUrl: "{{answers.targetUrl}}",
                        params: [{ name: "itemId", in: "query", required: true, type: "string" }],
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
                    }],
                },
            },
            {
                type: "function",
                function: {
                    id: "readOwnedItem",
                    method: "GET",
                    input: {
                        params: {
                            itemId: { type: "string" },
                        },
                    },
                    steps: [{
                        id: "item",
                        call: {
                            source: "{{answers.id}}",
                            endpoint: "read",
                            params: { itemId: "$input.params.itemId" },
                        },
                    }],
                    return: { status: 200, body: "$steps.item" },
                },
            },
        ],
    };
}
