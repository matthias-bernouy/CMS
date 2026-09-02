import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { integrationAnswers } from "./fixtures/definition.ts";
import { requestFromFetchInput } from "./requests/fetch.ts";
import { createMockFetch } from "./router/index.ts";
import { functionsBaseUrl, loadEdgeHandler, setActiveEnvironment, setActiveFetch, supabaseUrl } from "./runtime.ts";
import { createHarnessState, type HarnessOptions } from "./state.ts";

export async function createHarness(options: HarnessOptions = {}) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-delivery", action: "deployed" },
                ],
            };
        },
    };

    const hydratedDefinition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "mondial-relay",
    );
    if (!hydratedDefinition) {
        throw new Error("mondial-relay definition not found");
    }
    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            dashboardViews,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "mondial-relay", answers: integrationAnswers(), options: {} },
        [hydratedDefinition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    setActiveEnvironment({
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({
            default: "sb_secret_delivery_test",
            secondary: "sb_secret_delivery_secondary",
        }),
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-key",
    });

    const handler = await loadEdgeHandler();
    const state = createHarnessState();
    setActiveFetch(createMockFetch(options, state));

    return {
        result,
        sources,
        secrets,
        roles,
        dashboards,
        dashboardViews,
        importedBlocs,
        deployment,
        insertedShipments: state.insertedShipments,
        shipmentEvents: state.shipmentEvents,
        labelAccessTokens: state.labelAccessTokens,
        shipmentRecoveryEvents: state.shipmentRecoveryEvents,
        relaySelections: state.relaySelections,
        deliveryQuotes: state.deliveryQuotes,
        connectRequestXml: () => state.connectRequestXml,
        connectRequestCount: () => state.connectRequestCount,
        connectRequestRedirect: () => state.connectRequestRedirect,
        trackingRequestXml: () => state.trackingRequestXml,
        trackingRequestCount: () => state.trackingRequestCount,
        trackingRequestRedirect: () => state.trackingRequestRedirect,
        upstreamRequestUrls: () => [...state.upstreamRequestUrls],
        postgrestRequests: () => state.postgrestRequests.map((request) => ({ ...request })),
        providerRequests: () => state.providerRequests.map((request) => ({ ...request })),
        fetchTimeline: () => state.fetchTimeline.map((step) => ({ ...step })),
        resetRequestHistory() {
            state.postgrestRequests.length = 0;
            state.providerRequests.length = 0;
            state.fetchTimeline.length = 0;
        },
        relayLookupUrl: () => state.relayLookupUrl,
        async edgeRequest(request: Request): Promise<Response> {
            return await handler(request);
        },
        settingsRow: () => state.settingRow,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-delivery/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? (error.stack ?? error.message) : String(error), {
                    status: 599,
                });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return (await secrets.get(key)) ?? undefined;
        },
    };
}
