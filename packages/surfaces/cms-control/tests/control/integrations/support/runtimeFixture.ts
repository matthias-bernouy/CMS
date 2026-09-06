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
            expect(request.url).toBe("https://project-one.supabase.co/functions/v1/cms-emailer/source-management");
            expect(request.headers.get("authorization")).toBe(`Bearer ${environment.CMS_EMAILER_API_KEY}`);
            const payload = (await request.json()) as Record<string, any>;
            phases.push(payload.operation);
            if (payload.operation === "save-settings") {
                expect(payload.input.expectedRevision).toBe(savedRevision);
                settings = payload.input.values;
                savedRevision = "saved-1";
            }
            if (payload.operation === "apply-settings") {
                expect(payload.secretValues).toEqual({ smtpPassword: "selected-smtp-password" });
            }
            if (payload.operation === "confirm-apply") {
                expect(environment[runtime.passwordName]).toBe("selected-smtp-password");
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
    return { cms, secrets, installations, environment, runtime, phases, load, run };
}
