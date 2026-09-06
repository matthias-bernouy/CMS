import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact } from "../../helpers";

describe("@bernouy/cms-integrations afterInstallation secret rollback", () => {
    test("retains the previous secret and removes the new one when a rerun hook fails", async () => {
        const sources = new InMemorySourceRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const secrets = new InMemorySecretStore();
        const definition = secretHookDefinition();
        const deps = {
            sources,
            installations,
            secrets,
            sourceExecutorDeps: {
                fetchImpl: async (input: string | URL | Request) => {
                    const request = new Request(input);
                    return request.url.endsWith("/prod")
                        ? Response.json({ error: "sync rejected" }, { status: 503 })
                        : Response.json({});
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [definition],
            dto: {
                kind: definition.kind,
                answers: { id: "secret-hook", environment: "dev", apiKey: "dev-secret" },
                options: {},
            },
        });

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps,
                installations,
                integrationId: definition.kind,
                body: { answers: { environment: "prod", apiKey: "prod-secret" } },
            }),
        ).rejects.toThrow(/afterInstallation/);

        const installation = await installations.get(definition.kind);
        expect(installation?.status).toBe("success");
        expect(installation?.answersSnapshot.environment).toBe("dev");
        expect(installation?.secretRefs.apiKey).toBe("TOKEN_DEV");
        expect(await secrets.get("TOKEN_DEV")).toBe("dev-secret");
        expect(await secrets.get("TOKEN_PROD")).toBeNull();
        expect((await sources.getSource("urn:secret-hook"))?.endpoints[0]?.targetUrl).toEndWith("/dev");
    });
});

function secretHookDefinition(): IntegrationDefinition {
    return {
        kind: "secret-hook",
        label: "Secret hook",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "environment", label: "Environment", type: "text", required: true },
            { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
        ],
        secrets: [{ input: "apiKey", key: "TOKEN_{{env answers.environment}}" }],
        afterInstallation: [
            {
                id: "sync",
                steps: [{ id: "sync", call: { source: "{{answers.id}}", endpoint: "list" } }],
            },
        ],
        artifacts: [sourceArtifact("{{answers.id}}", "https://configuration.test/{{answers.environment}}")],
    };
}
