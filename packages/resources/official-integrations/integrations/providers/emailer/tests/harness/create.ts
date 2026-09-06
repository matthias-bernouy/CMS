import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { newsletterSource } from "../fixtures/newsletter";
import { providerFunctionSecrets } from "../fixtures/provider";
import { functionsBaseUrl, loadEdgeHandler, setActiveEnv, setActiveFetch, supabaseUrl } from "./runtime";
import { requestFromFetchInput } from "./supabase/http";
import { EmailerRestMock } from "./supabase/mock";

export async function createHarness() {
    const base = await importEmailer();
    const functionSecrets = base.deployment?.functions[0]?.secrets ?? {};
    setActiveEnv({
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    });

    const handler = await loadEdgeHandler();
    const rest = new EmailerRestMock();
    setActiveFetch(async (input, init) => rest.fetch(input, init));

    return {
        ...base,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-emailer/`)) {
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
            return (await base.secrets.get(key)) ?? undefined;
        },
    };
}

async function importEmailer() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("emailer");
    if (!definition) {
        throw new Error("emailer definition not found");
    }

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const functions = new InMemoryFunctionRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    await secrets.set("NEWSLETTER_KEY", "newsletter-key");
    await sources.createSource(newsletterSource());
    await installations.create({
        id: "newsletter",
        label: "Newsletter",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id: "newsletter" },
        secretRefs: { cmsApiKey: "NEWSLETTER_KEY" },
        secretInputs: ["cmsApiKey"],
        artifacts: [{ type: "source", id: "urn:newsletter", action: "created" }],
        runs: [],
    });
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = {
                ...next,
                functions: next.functions.map((fn) => ({
                    ...fn,
                    secrets: {
                        ...providerFunctionSecrets,
                        ...(fn.secrets ?? {}),
                    },
                })),
            };
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-emailer", action: "deployed" },
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
            functions,
            installations,
            connectorDeployers: [deployer],
        },
        {
            kind: "emailer",
            answers: {},
            options: {},
        },
        [definition],
    );

    return { result, sources, secrets, dashboards, dashboardViews, functions, deployment };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
