import { runCreate } from "./create";
import { runRerun } from "./rerun";
import { createIntegrationInstanceId } from "./ids";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";
import type {
    IntegrationInstance,
    IntegrationRun,
} from "../../interfaces/IntegrationInstance";
import type { IntegrationInstanceRepository } from "../../interfaces/IntegrationInstanceRepository";

export type RunIntegrationInstanceCreateRequest = {
    mode: "create";
    deps: IntegrationImportDeps;
    instances: IntegrationInstanceRepository;
    dto: IntegrationImportDto;
    siteIntegrations?: IntegrationDefinition[];
};

export type RunIntegrationInstanceRerunRequest = {
    mode: "rerun";
    deps: IntegrationImportDeps;
    instances: IntegrationInstanceRepository;
    instanceId: string;
    body?: Record<string, unknown>;
    siteIntegrations?: IntegrationDefinition[];
};

export type RunIntegrationInstanceResult = IntegrationImportResult & {
    instance: IntegrationInstance;
    run: IntegrationRun;
};

export { createIntegrationInstanceId };

export async function runIntegrationInstance(
    request: RunIntegrationInstanceCreateRequest | RunIntegrationInstanceRerunRequest,
): Promise<RunIntegrationInstanceResult> {
    return request.mode === "create" ? runCreate(request) : runRerun(request);
}
