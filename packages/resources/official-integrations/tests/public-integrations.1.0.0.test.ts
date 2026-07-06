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
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";

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
    });
});

export async function importScenario(kind: string, answers: Record<string, string>) {
    const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definition = await repo.get(kind);
    if (!definition) throw new Error(`${kind} definition not found`);

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
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
            dashboards,
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

    return { result, sources, secrets, dashboards, importedBlocs, deployment };
}
