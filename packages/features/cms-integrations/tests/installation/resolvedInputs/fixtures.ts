import {
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
    type IntegrationImportDeps,
    type IntegrationResolvedPage,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

export function createHarness() {
    const sources = new InMemorySourceRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const calls: unknown[] = [];
    const deps: IntegrationImportDeps = {
        sources,
        installations,
        secrets: new InMemorySecretStore(),
        sourceExecutorDeps: {
            fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
                const request = new Request(input, init);
                calls.push(await request.json());
                return Response.json({ ok: true });
            },
        },
    };
    return { sources, installations, calls, deps };
}

export function page(path: string, revision: number): IntegrationResolvedPage {
    return {
        id: "terms",
        path,
        title: "Terms",
        description: `Terms revision ${revision}`,
        content: `<article>Terms revision ${revision}</article>`,
    };
}

export function definition(): IntegrationDefinition {
    return {
        kind: "legal-config",
        label: "Legal configuration",
        inputs: [
            {
                name: "documents",
                label: "Documents",
                type: "object-list",
                fields: [
                    { name: "page", label: "Page", type: "page-link", required: true },
                    {
                        name: "contexts",
                        label: "Contexts",
                        type: "select",
                        multiple: true,
                        options: [{ label: "Checkout", value: "checkout" }],
                    },
                    { name: "required", label: "Required", type: "boolean" },
                ],
            },
        ],
        afterInstallation: [
            {
                id: "sync",
                steps: [
                    {
                        id: "sync",
                        call: {
                            source: "legal-config",
                            endpoint: "sync",
                            body: { documents: "{{json resolved.documents}}" },
                        },
                    },
                ],
            },
        ],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "legal-config",
                    meta: { name: "Legal configuration" },
                    endpoints: [
                        {
                            endpointId: "sync",
                            method: "POST",
                            access: { mode: "system" },
                            targetUrl: "https://config.test/legal",
                            params: [],
                            body: { type: "object" },
                            output: [{ status: "200", body: { type: "object" } }],
                        },
                    ],
                },
            },
        ],
    };
}
