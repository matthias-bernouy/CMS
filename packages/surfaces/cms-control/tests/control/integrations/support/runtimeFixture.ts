import { integrationEndpointInterceptor } from "cms-control/core/admin/control/sourceProxy/integration";
import { executeEndpoint } from "@bernouy/cms-sources";
import { createSecretResolver } from "@bernouy/cms-secrets";
import { expect } from "bun:test";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemoryDashboardAssignmentRepository } from "@bernouy/cms-dashboards";
import { resolve } from "node:path";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { integrationInstallationDeps } from "cms-control/core/management/integrations/installationActions";
import { makeCms } from "./helpers";

export async function runtimeFixture() {
    const { connectionHandler } = (await import(
        resolve(
            import.meta.dir,
            "../../../../../../resources/official-integrations/integrations/providers/emailer/connectors/supabase/functions/cms-emailer/connection.ts",
        )
    )) as {
        connectionHandler(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response>;
    };
    const { cms, secrets, integrationInstallations: installations } = makeCms([]);
    cms.roles = new InMemoryRolesRepository();
    cms.dashboardAssignments = new InMemoryDashboardAssignmentRepository();
    const environment: Record<string, string> = {};
    const runtime = { passwordName: "SMTP_PASSWORD" };
    const bootstrapSecrets: Record<string, string> = {};
    const phases: string[] = [];
    let settings: Record<string, unknown> = {};
    let savedRevision: string | null = null;
    let appliedRevision: string | null = null;
    await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "provider-token");
    const deployer = new ConfiguredSupabaseConnectorDeployer({
        providerRepository: new InMemoryIntegrationConnectorProviderRepository({
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        }),
        secrets,
        functionSecrets: bootstrapSecrets,
        fetch: (async (input, init) => {
            const request = new Request(input, init);
            if (request.url.endsWith("/secrets")) {
                for (const { name, value } of (await request.json()) as Array<{ name: string; value: string }>) {
                    environment[name] = value;
                    if (name === runtime.passwordName && value === "selected-smtp-password") {
                        phases.push("sync");
                    }
                }
            }
            return Response.json(request.url.endsWith("/postgrest") ? { db_schema: "public" } : []);
        }) as typeof fetch,
    });
    cms.integrationConnectorDeployers = { supabase: deployer };
    cms.sourceExecutorDeps = {
        fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            if (
                new URL(request.url).pathname.endsWith("/connection") ||
                new URL(request.url).pathname.endsWith("/connection/retry")
            ) {
                return connectionHandler(async (inner) =>
                    cms.sourceExecutorDeps.fetchImpl(
                        new Request(
                            "https://project-one.supabase.co/functions/v1/cms-emailer/source-management",
                            inner,
                        ),
                    ),
                )(request);
            }
            expect(request.url).toBe("https://project-one.supabase.co/functions/v1/cms-emailer/source-management");
            expect(request.headers.get("authorization")).toBe(`Bearer ${environment.CMS_EMAILER_API_KEY}`);
            const payload = (await request.json()) as Record<string, any>;
            phases.push(payload.operation);
            if (payload.operation === "save-connection") {
                expect(payload.input.expectedRevision).toBe(savedRevision);
                expect(payload.secretValues).toEqual({ smtpPassword: "selected-smtp-password" });
                settings = payload.input.values;
                savedRevision = "saved-1";
                appliedRevision = savedRevision;
            }
            return Response.json({ values: settings, savedRevision, appliedRevision });
        },
    };
    async function load(kind: string, group: string) {
        const root = resolve(
            import.meta.dir,
            "../../../../../../resources/official-integrations/integrations",
            group,
            kind,
        );
        const definition = await loadIntegrationDefinitionFromVersionRoot({
            definitionPath: resolve(root, "definition.json"),
            versionRoot: root,
            expectedKind: kind,
            expectedVersion: "1.0.0",
        });
        const passwordBinding = Object.entries(definition.management?.runtimeSecrets ?? {}).find(
            ([, binding]) => "field" in binding && binding.field === "smtpPassword",
        );
        if (passwordBinding) {
            runtime.passwordName = passwordBinding[0];
            bootstrapSecrets[runtime.passwordName] = "stale-bootstrap-password";
        }
        return { definition, root };
    }
    async function run(mode: "create" | "rerun" | "upgrade", definition: IntegrationDefinition, root: string) {
        const common = {
            deps: integrationInstallationDeps(cms),
            installations,
            packageResolver: {
                resolve: async () => ({
                    root,
                    kind: definition.kind,
                    version: definition.version!,
                    digest: "a".repeat(64),
                    definition,
                }),
            },
        };
        return mode === "create"
            ? runIntegrationInstallation({
                  ...common,
                  mode,
                  dto: { kind: definition.kind, answers: {}, options: {} },
                  siteIntegrations: [definition],
              })
            : mode === "upgrade"
              ? runIntegrationInstallation({
                    ...common,
                    mode,
                    integrationId: definition.kind,
                    targetDefinition: definition,
                })
              : runIntegrationInstallation({ ...common, mode, integrationId: definition.kind });
    }
    async function connection(body?: Record<string, unknown>, retry = false) {
        const id = body === undefined ? "getConnection" : retry ? "retryConnection" : "saveConnection";
        const source = await cms.sources.getSource("urn:emailer");
        const endpoint = source.endpoints.find((candidate: { urn: string }) => candidate.urn === `urn:emailer:${id}`)!;
        const request = new Request(`https://control.test/.cms/sources/emailer/${id}`, {
            method: body === undefined ? "GET" : "POST",
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const response = await integrationEndpointInterceptor(
            { ...cms, configuration: { integrationConnectorDeployers: cms.integrationConnectorDeployers } },
            async () => ({ identifier: "verified-admin", role: "admin" }),
        )(endpoint, request, (candidate) =>
            executeEndpoint(endpoint, candidate, {
                ...cms.sourceExecutorDeps,
                resolveSecret: createSecretResolver(secrets),
                resolveContext: async () => ({ userID: "verified-admin", userRole: "admin" }),
            }),
        );
        const result = await response.json();
        expect(response.status).toBe(200);
        return result;
    }
    return { cms, secrets, installations, environment, runtime, phases, load, run, connection };
}
