import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import {
    InMemoryIntegrationConnectorProviderRepository,
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";

type ManagementRequest = { body: BodyInit | null | undefined; method: string; url: string };

describe("Commerce media connector rerun", () => {
    test("reruns an existing installation and applies current SQL before deploying current Edge", async () => {
        const integrationRepository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await integrationRepository.get("commerce");
        if (!definition) {
            throw new Error("Commerce definition not found.");
        }
        const version = definition.version ?? "";
        const located = await integrationRepository.locateExactVersion(definition.kind, version);
        if (!located) {
            throw new Error("Commerce package root not found.");
        }
        const requests: ManagementRequest[] = [];
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
            provider: "supabase",
            enabled: true,
            projectRef: "commerce-rollout",
        });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_rollout");
        const deployer = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets,
            apiBaseUrl: "https://api.supabase.test",
            fetch: managementApi(requests),
        });
        const packageResolver = {
            resolve: async () => ({
                root: located.root,
                kind: definition.kind,
                version,
                digest: "a".repeat(64),
                definition,
            }),
        };
        const deps = {
            sources: new InMemorySourceRepository(),
            sourceOverlays: new InMemorySourceOverlayRepository(),
            dashboards: new InMemoryDashboardRepository(),
            dashboardViews: new InMemoryDashboardViewRepository(),
            triggers: new InMemoryTriggerRepository(),
            roles: new InMemoryRolesRepository(),
            secrets,
            installations,
            connectorDeployers: [deployer],
            sourceExecutorDeps: {
                fetchImpl: async (input) => {
                    const request = new Request(input);
                    if (request.url.includes("/cms-commerce/system/buyer-legal-documents/sync")) {
                        return Response.json({ enabled: false, documents: [] });
                    }
                    return Response.json(
                        { error: `unexpected after-installation request: ${request.url}` },
                        { status: 500 },
                    );
                },
                resolveSecret: async () => "commerce-rollout-cms-api-key",
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            packageResolver,
            siteIntegrations: [definition],
            dto: {
                kind: "commerce",
                answers: { id: "commerce", buyerLegalEnabled: false, buyerLegalDocuments: [] },
                options: {},
            },
        });
        requests.length = 0;

        const rerun = await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            packageResolver,
            integrationId: "commerce",
            body: {},
        });
        const schemaIndex = requests.findIndex((request) => schemaQuery(request)?.includes("attach_offer_media_v2"));
        const functionIndex = requests.findIndex((request) =>
            request.url.includes("/functions/deploy?slug=cms-commerce"),
        );
        const schema = schemaQuery(requests[schemaIndex]);
        const functionFiles = await deployedFiles(requests[functionIndex]);
        const offerMedia = functionFiles.get("routes/offer/media.ts");
        const productMedia = functionFiles.get("routes/catalog/media/product.ts");

        expect(schemaIndex).toBeGreaterThanOrEqual(0);
        expect(functionIndex).toBeGreaterThan(schemaIndex);
        expect(schema).toContain("create or replace function commerce.attach_offer_media_v2");
        expect(schema).toContain("create or replace function commerce.remove_product_media");
        expect(schema).not.toContain("'replaced_storage_path'");
        expect(offerMedia).toContain('rpcRecord("attach_offer_media_v2"');
        expect(productMedia).toContain('rpcRecord("attach_product_media_v2"');
        expect(offerMedia).not.toContain("removeReturnedObject");
        expect(productMedia).not.toContain("removeReturnedObject");
        expect(rerun.installation.runCount).toBe(2);
        expect(rerun.installation.runs.map((run) => run.status)).toEqual(["success", "success"]);
        expect(rerun.connectors?.[0]?.resources?.map((resource) => resource.type)).toEqual([
            "schema",
            "config",
            "config",
            "config",
            "secret",
            "config",
            "function",
        ]);
    }, 60_000);
});

function managementApi(requests: ManagementRequest[]): typeof fetch {
    return async (input, init) => {
        const request = { body: init?.body, method: init?.method ?? "GET", url: String(input) };
        requests.push(request);
        if (request.url.endsWith("/postgrest") && request.method === "GET") {
            return Response.json({ db_schema: "public,storage" });
        }
        if (request.url.includes("/functions/deploy")) {
            return Response.json({ id: "fn-commerce", status: "ACTIVE" }, { status: 201 });
        }
        return new Response(null, { status: request.method === "PATCH" ? 200 : 201 });
    };
}

function schemaQuery(request: ManagementRequest | undefined): string | null {
    if (!request?.url.endsWith("/database/query") || typeof request.body !== "string") {
        return null;
    }
    const body = JSON.parse(request.body) as { query?: unknown };
    return typeof body.query === "string" ? body.query : null;
}

async function deployedFiles(request: ManagementRequest | undefined): Promise<Map<string, string>> {
    if (!(request?.body instanceof FormData)) {
        throw new Error("Commerce Edge deployment did not use multipart FormData.");
    }
    const entries = request.body.getAll("file") as Array<Blob & { name?: string }>;
    return new Map(await Promise.all(entries.map(async (file) => [file.name ?? "", await file.text()] as const)));
}
