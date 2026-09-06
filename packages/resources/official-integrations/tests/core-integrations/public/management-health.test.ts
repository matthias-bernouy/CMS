import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import {
    InMemoryIntegrationInstallationRepository,
    IntegrationManagementService,
    resolveTemplates,
    type IntegrationHealthReport,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { createSecretResolver, InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, sourceDtoToSource } from "@bernouy/cms-sources";

test.each(["consent", "commerce"])(
    "%s Health survives its actual function and Source output projection",
    async (kind) => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = (await repository.get(kind))!;
        const functionId = definition.management!.health!.functionId;
        const functionArtifact = definition.artifacts!.find(
            (artifact) => artifact.type === "function" && artifact.function.id === functionId,
        );
        const sourceArtifact = definition.artifacts!.find((artifact) => artifact.type === "source");
        if (functionArtifact?.type !== "function" || sourceArtifact?.type !== "source") {
            throw new Error("Management artifacts are missing");
        }
        const endpoint = sourceArtifact.source.endpoints.find((item) => item.endpointId === "manageIntegration")!;
        const context = {
            answers: {},
            secrets: { cmsApiKey: "${MANAGEMENT_AUTH}" },
            connectors: { supabase: { functionsBaseUrl: "https://provider.example.test/functions/v1" } },
        };
        const fn = resolveTemplates(functionArtifact.function, context);
        const sources = new InMemorySourceRepository();
        await sources.createSource(
            sourceDtoToSource(
                resolveTemplates(
                    {
                        ...sourceArtifact.source,
                        endpoints: [endpoint],
                        identityAuthority: kind,
                    },
                    context,
                ),
            ),
        );
        const secrets = new InMemorySecretStore();
        await secrets.set("MANAGEMENT_AUTH", "fixture-auth-key");
        const installations = new InMemoryIntegrationInstallationRepository();
        await installations.create({
            id: kind,
            label: kind,
            definitionVersion: definition.version!,
            definitionSnapshot: definition,
            status: "success",
            answersSnapshot: {},
            secretRefs: { cmsApiKey: "MANAGEMENT_AUTH" },
            secretInputs: [],
            artifacts: [{ id: functionId, type: "function", action: "created" }],
        });
        const health: IntegrationHealthReport = {
            schemaVersion: 1,
            status: "ready",
            checkedAt: new Date().toISOString(),
            configuration: { savedRevision: "revision-1", appliedRevision: null },
            checks: [
                { id: "storage", status: "ok", code: "storage_available", message: "Storage available", actionIds: [] },
            ],
            operation: { id: "apply-1", status: "running", steps: [{ id: "settings", status: "pending" }] },
        };
        const settings = {
            values: { enabled: true, nested: { field: "preserved" } },
            savedRevision: "revision-1",
            appliedRevision: null,
        };
        const operations: string[] = [];
        const service = new IntegrationManagementService({
            installations,
            secrets,
            async invoke(_installation, _functionId, payload, reader) {
                const response = await executeFunction(
                    fn,
                    new Request("https://cms.internal/management", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                    }),
                    {
                        sources,
                        user: payload.actor ?? {},
                        deps: {
                            resolveSecret: createSecretResolver(reader),
                            resolveContext: async () => ({ userID: payload.actor?.id, userRole: payload.actor?.role }),
                            fetchImpl: async (input, init) => {
                                const request = new Request(input, init);
                                expect(request.headers.get("authorization")).toBe("Bearer fixture-auth-key");
                                expect(request.headers.get("x-cms-user-id")).toBe("verified-admin");
                                const inputBody = await request.json();
                                operations.push(inputBody.operation);
                                return Response.json({
                                    ...(inputBody.operation === "health" ? health : settings),
                                    undeclaredDiagnostic: "must not escape the source projection",
                                });
                            },
                        },
                    },
                );
                expect(response.status).toBe(200);
                const projected = await response.json();
                expect(projected.undeclaredDiagnostic).toBeUndefined();
                return projected;
            },
        });
        const actor = { id: "verified-admin", role: "admin" };
        expect(await service.health(kind, true, actor)).toMatchObject({
            observation: "valid",
            freshness: "fresh",
            report: health,
        });
        expect(await service.settings(kind, actor)).toEqual(settings);
        expect(operations).toEqual(["health", "read-settings"]);
    },
);
