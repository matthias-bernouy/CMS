import { importIntegration, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { sourcesForFulfillment } from "./sources";

export { sourcesForFulfillment } from "./sources";

export async function installedFunctions() {
    const sources = await sourcesForFulfillment();
    const functions = new InMemoryFunctionRepository();
    const triggers = new InMemoryTriggerRepository();
    const installations = await installationsForFulfillment();
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-mondial-relay-fulfillment",
    );
    if (!definition) {
        throw new Error("fulfillment definition not found");
    }
    await importIntegration(
        {
            sources,
            functions,
            installations,
            triggers,
            roles: new InMemoryRolesRepository(),
            blocs: {
                async importBloc(artifact) {
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: definition.kind, answers: {}, options: {} },
        [definition],
    );
    return { sources, functions };
}

export async function installationsForFulfillment(
    providerVersion = "2.0.0",
): Promise<InMemoryIntegrationInstallationRepository> {
    const repository = new InMemoryIntegrationInstallationRepository();
    for (const [id, sourceId, definitionVersion] of [
        ["commerce", "commerce", "1.0.0"],
        ["mondial-relay", "delivery", providerVersion],
    ] as const) {
        await repository.create({
            id,
            label: id,
            definitionVersion,
            status: "success",
            answersSnapshot: { id: sourceId },
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: `urn:${sourceId}`, action: "created" }],
            runs: [],
        });
    }
    return repository;
}

export async function requiredFunction(repository: InMemoryFunctionRepository, id: string) {
    const fn = await repository.getFunction(id);
    if (!fn) {
        throw new Error(`function ${id} not installed`);
    }
    return fn;
}

export function request(id: string, body: unknown): Request {
    return new Request(`https://cms.test/functions/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function reconciliationHealthResponse(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (path === "/deliveryProjectionHealth") {
        return Response.json({
            checkedAt: "2026-07-13T09:31:00.000Z",
            pendingProjectionCount: 0,
            manualReviewCount: 0,
            trackingErrorCount: 0,
            orders: [],
        });
    }
    if (path === "/recordDeliveryReconciliationHealth") {
        return Response.json(await request.json());
    }
    return null;
}
