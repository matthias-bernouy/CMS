import { expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { runIntegrationInstallation, type IntegrationImportDeps } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { installedConsent } from "./setup";

test("Commerce installs and reruns notification setup with both official Emailer Sources present", async () => {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definitions = await Promise.all(
        ["newsletter", "emailer", "commerce"].map(async (kind) => {
            const definition = await repository.get(kind);
            if (!definition) {
                throw new Error(`Missing official definition ${kind}`);
            }
            return definition;
        }),
    );
    const installations = await installedConsent();
    const sources = new InMemorySourceRepository();
    const requests: { path: string; body?: unknown }[] = [];
    const deps: IntegrationImportDeps = {
        installations,
        sources,
        secrets: new InMemorySecretStore(),
        roles: new InMemoryRolesRepository(),
        sourceOverlays: new InMemorySourceOverlayRepository(),
        functions: new InMemoryFunctionRepository(),
        triggers: new InMemoryTriggerRepository(),
        dashboards: new InMemoryDashboardRepository(),
        dashboardViews: new InMemoryDashboardViewRepository(),
        connectorDeployers: [
            {
                provider: "supabase",
                async previewOutputs() {
                    return { functionsBaseUrl: "https://optional-emailer.test/functions/v1" };
                },
                async deploy() {
                    return {
                        provider: "supabase",
                        outputs: { functionsBaseUrl: "https://optional-emailer.test/functions/v1" },
                    };
                },
            },
        ],
        sourceExecutorDeps: {
            resolveSecret: async () => "test-internal-cms-key",
            fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                const path = new URL(request.url).pathname;
                const body = request.method === "POST" ? await request.json() : undefined;
                requests.push({ path, ...(body === undefined ? {} : { body }) });
                if (path.endsWith("/cms-commerce/notifications/templates")) {
                    return Response.json({ items: [] });
                }
                if (path.endsWith("/cms-emailer/templates/install")) {
                    return Response.json({ accepted: 0 });
                }
                throw new Error(`Unexpected setup request ${path}`);
            },
        },
    };
    for (const kind of ["newsletter", "emailer", "commerce"]) {
        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: definitions,
            dto: { kind, answers: {}, options: {} },
        });
    }
    expect(
        (await installations.get("emailer"))?.artifacts
            .filter((artifact) => artifact.type === "source")
            .map((artifact) => artifact.id),
    ).toEqual(["urn:emailer", "urn:emailer-broadcast"]);
    expect(await sources.getSource("urn:emailer-broadcast")).toBeTruthy();
    const result = await runIntegrationInstallation({
        mode: "rerun",
        deps,
        installations,
        integrationId: "commerce",
        body: {},
        siteIntegrations: definitions,
    });
    expect(result.installation.status).toBe("success");
    expect(requests).toEqual([
        { path: "/functions/v1/cms-commerce/notifications/templates" },
        { path: "/functions/v1/cms-emailer/templates/install", body: { templates: [] } },
        { path: "/functions/v1/cms-commerce/notifications/templates" },
        { path: "/functions/v1/cms-emailer/templates/install", body: { templates: [] } },
    ]);
});
