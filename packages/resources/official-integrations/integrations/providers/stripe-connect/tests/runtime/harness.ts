import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { edgeFunctionUrl, functionsBaseUrl, supabaseUrl } from "./constants";
import { loadEdgeHandler, setActiveEnvironment, setActiveFetch } from "./environment";
import { requestFromFetchInput } from "./http";
import { StripeConnectMock } from "./mock/stripe-connect";
import { stripeWebhookProvisioner } from "../../../../../tests/helpers/stripeWebhookProvisioner";
import { handleMarketplaceTermsManagementRequest } from "../../connectors/supabase/functions/cms-stripe-connect-management/handler";

export async function createStripeConnectHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("stripe-connect");
    if (!definition) {
        throw new Error("stripe-connect definition not found");
    }

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const identities = new InMemoryIdentityService();
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async previewOutputs() {
            return { functionsBaseUrl };
        },
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "install/sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-stripe-connect", action: "deployed" },
                    { type: "function", id: "cms-stripe-connect", action: "deployed" },
                    { type: "function", id: "cms-stripe-connect-management", action: "deployed" },
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
            dashboardViews,
            connectorDeployers: [deployer],
            connectorInstanceIds: { primary: "stripe-connect-test-primary" },
            provisioners: [stripeWebhookProvisioner()],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        {
            kind: "stripe-connect",
            answers: {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_123",
                stripePublishableKey: "pk_test_123",
                defaultCountry: "FR",
                defaultCurrency: "EUR",
                sellerActivityDescription: "Sale of second-hand goods between individuals.",
            },
            options: {},
        },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    setActiveEnvironment({
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    });

    const handler = await loadEdgeHandler(() => import(edgeFunctionUrl));
    const rest = new StripeConnectMock();
    setActiveFetch(async (input, init) => rest.fetch(input, init));

    return {
        result,
        sources,
        secrets,
        roles,
        dashboards,
        dashboardViews,
        importedBlocs,
        identities,
        deployment,
        rest,
        async edgeRequest(request: Request): Promise<Response> {
            return await handler(request);
        },
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (request.url.startsWith(`${functionsBaseUrl}/cms-stripe-connect-management/`)) {
                    return await handleMarketplaceTermsManagementRequest(request);
                }
                if (request.url.startsWith(`${functionsBaseUrl}/cms-stripe-connect/`)) {
                    return await handler(request);
                }
                throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
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

export type StripeConnectHarness = Awaited<ReturnType<typeof createStripeConnectHarness>>;
