import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    materializeSourceOverlays,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import { functionsBaseUrl, loadEdgeHandler, setActiveEnv, setActiveFetch, supabaseUrl } from "./runtime";
import { requestFromFetchInput } from "./supabase/http";
import { UserAccountSupabaseMock } from "./supabase/mock";

export async function createHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("user-account");
    if (!definition) {
        throw new Error("user-account definition not found");
    }

    const sources = new InMemorySourceRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-user-account", action: "deployed" },
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            functions: new InMemoryFunctionRepository(),
            sources,
            secrets,
            roles,
            dashboards,
            dashboardViews,
            sourceOverlays,
            connectorDeployers: [deployer],
        },
        { kind: "user-account", answers: {}, options: {} },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    setActiveEnv({
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    });

    const handler = await loadEdgeHandler();
    const rest = new UserAccountSupabaseMock();
    setActiveFetch(async (input, init) => rest.fetch(input, init));
    const sourceFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        try {
            const request = requestFromFetchInput(input, init);
            if (!request.url.startsWith(`${functionsBaseUrl}/cms-user-account/`)) {
                throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
            }
            return await handler(request);
        } catch (error) {
            return new Response(error instanceof Error ? (error.stack ?? error.message) : String(error), {
                status: 599,
            });
        }
    };
    const overlayDeps = {
        fetchImpl: sourceFetch,
        resolveSecret: async (ref: string): Promise<string | undefined> => {
            const key = secretRefToKey(ref) ?? ref;
            return (await secrets.get(key)) ?? undefined;
        },
    };
    const overlaySources = new SourceOverlaySourceRepository(sources, sourceOverlays, { deps: overlayDeps });

    return {
        result,
        sources: overlaySources,
        baseSources: sources,
        sourceOverlays,
        secrets,
        roles,
        dashboards,
        dashboardViews,
        deployment,
        rest,
        async materializedOverlays() {
            const source = await sources.getSource("urn:user-account");
            if (!source) {
                throw new Error("user-account source not installed");
            }
            return await materializeSourceOverlays(source, await sourceOverlays.getAllOverlays(), overlayDeps);
        },
        sourceFetch,
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return (await secrets.get(key)) ?? undefined;
        },
    };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
