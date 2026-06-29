import { InMemoryIntegrationInstanceRepository } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function makeCms(siteIntegrations: IntegrationDefinition[] = []) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const integrationInstances = new InMemoryIntegrationInstanceRepository();
    const cms = {
        sources,
        secrets,
        integrations: siteIntegrations,
        integrationInstances,
    };
    return { cms: cms as any, sources, secrets, integrationInstances };
}

export function postImport(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/integrations/import", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

export function getInstances(id?: string) {
    const url = id
        ? `http://localhost/cms/api/integrations/instances?id=${encodeURIComponent(id)}`
        : "http://localhost/cms/api/integrations/instances";
    return new Request(url);
}

export function postRerun(id?: string, body?: Record<string, unknown>) {
    const query = id ? `?id=${encodeURIComponent(id)}` : "";
    return new Request(`http://localhost/cms/api/integrations/instances/rerun${query}`, {
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
