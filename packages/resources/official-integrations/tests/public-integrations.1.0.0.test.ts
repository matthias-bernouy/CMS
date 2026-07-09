import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";

describe("public integrations 1.0.0", () => {
    test.each([
        {
            kind: "newsletter",
            sourceId: "newsletter",
            dashboardId: "newsletter-subscriptions",
            blocTags: ["newsletter-subscription"],
            answers: { id: "newsletter" },
            functionName: "cms-newsletter",
            schemas: ["newsletter"],
            expectedEndpoints: ["setSubscription", "listSubscriptions", "exportSubscriptions", "getSubscription", "deleteSubscription"],
        },
        {
            kind: "emailer",
            sourceId: "emailer",
            dashboardId: "emailer-templates",
            blocTags: [],
            answers: { id: "emailer" },
            functionName: "cms-emailer",
            schemas: ["emailer"],
            expectedEndpoints: ["listTemplates", "getTemplate", "upsertTemplate", "sendTestEmail", "sendTemplateEmail", "listMessages", "getSettings", "updateSettings"],
        },
        {
            kind: "stripe-connect",
            sourceId: "stripe-connect",
            dashboardId: "stripe-connect-dashboard",
            blocTags: ["stripe-connect-onboarding"],
            answers: {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_123",
                stripePublishableKey: "pk_test_123",
                defaultCountry: "FR",
                defaultCurrency: "EUR",
            },
            functionName: "cms-stripe-connect",
            schemas: ["stripe_connect"],
            expectedEndpoints: ["getConnectStatus", "createOnboardingSession", "listConnectAccounts", "listPayments"],
        },
        {
            kind: "user-account",
            sourceId: "user-account",
            dashboardId: "user-account-users",
            blocTags: ["user-account-form"],
            answers: { id: "user-account" },
            functionName: "cms-user-account",
            schemas: ["user_account"],
            expectedEndpoints: ["getAccount", "updateAccount", "listAccounts", "createUserPersonalInformation"],
        },
    ])("installs $kind source, dashboard, connector, and blocs", async (scenario) => {
        const harness = await importScenario(scenario.kind, scenario.answers);
        const source = await harness.sources.getSource(`urn:${scenario.sourceId}`);
        const dashboard = await harness.dashboards.getDashboard(scenario.dashboardId);

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(dashboard).toBeTruthy();
        expect(harness.deployment?.dataApiSchemas).toEqual(scenario.schemas);
        expect(harness.deployment?.functions.map(fn => fn.name)).toEqual([scenario.functionName]);
        expect(harness.importedBlocs.map(bloc => bloc.tag)).toEqual(scenario.blocTags);

        const endpointUrns = source?.endpoints.map(endpoint => endpoint.urn) ?? [];
        for (const endpoint of scenario.expectedEndpoints) {
            expect(endpointUrns).toContain(`urn:${scenario.sourceId}:${endpoint}`);
        }

        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).not.toContain("\"widget\":\"w-create\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-update\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-delete\"");
        expect(dashboardJson).not.toContain("\"collection\"");

        if (scenario.kind === "newsletter") {
            const table = dashboard?.views[0] as Record<string, unknown> | undefined;
            expect(dashboard?.views).toHaveLength(1);
            expect(table?.widget).toBe("w-table");
            expect(table?.selection).toBeUndefined();
            expect(dashboardJson).not.toContain("subscriptionDetail");
            expect(dashboardJson).not.toContain("createSubscription");
            expect(dashboardJson).toContain("exportSubscriptions");
            expect(dashboardJson).toContain("newsletter-subscriptions.csv");
        }
        if (scenario.kind === "emailer") {
            const settingsDashboard = await harness.dashboards.getDashboard("emailer-settings");
            expect(settingsDashboard).toBeTruthy();
            expect(validateDashboard(settingsDashboard!, { source })).toEqual([]);
            const settingsJson = JSON.stringify(settingsDashboard);
            expect(dashboardJson).toContain("newTemplate");
            expect(dashboardJson).toContain("sendTestEmail");
            expect(dashboardJson).not.toContain("messagesTable");
            expect(dashboardJson).not.toContain("textBody");
            expect(dashboardJson).not.toContain("sampleDataJson");
            expect(settingsJson).toContain("emailerSettings");
            expect(settingsJson).toContain("getSettings");
            expect(settingsJson).toContain("saveSettings");
            expect(settingsJson).toContain("updateSettings");
        }
    });

    test("declares response outputs for every official JSON endpoint", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const missing: string[] = [];

        for (const entry of await repo.list()) {
            const definition = await repo.get(entry.kind);
            for (const artifact of definition?.artifacts ?? []) {
                if (artifact.type !== "source") continue;
                for (const endpoint of artifact.source.endpoints) {
                    if ((endpoint.responseKind ?? "json") !== "json") continue;
                    if (endpoint.output?.length) continue;
                    missing.push(`${entry.kind}:${artifact.source.id}:${endpoint.endpointId}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });
});

export async function importScenario(kind: string, answers: Record<string, string | boolean>) {
    const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definition = await repo.get(kind);
    if (!definition) throw new Error(`${kind} definition not found`);

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    ...(next.functions ?? []).map(fn => ({ type: "function" as const, id: fn.name, action: "deployed" as const })),
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            sourceOverlays,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind, answers, options: {} },
        [definition as IntegrationDefinition],
    );

    return { result, sources, sourceOverlays, secrets, dashboards, importedBlocs, deployment };
}
