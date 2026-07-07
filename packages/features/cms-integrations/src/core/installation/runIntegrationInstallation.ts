import { runCreate } from "./create";
import { runRerun } from "./rerun";
import { integrationInstallationId } from "./ids";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";
import type {
    IntegrationInstallation,
    IntegrationRun,
} from "../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../interfaces/IntegrationInstallationRepository";

export type RunIntegrationInstallationCreateRequest = {
    mode: "create";
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    dto: IntegrationImportDto;
    siteIntegrations?: IntegrationDefinition[];
};

export type RunIntegrationInstallationRerunRequest = {
    mode: "rerun";
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    integrationId: string;
    body?: Record<string, unknown>;
    siteIntegrations?: IntegrationDefinition[];
};

export type RunIntegrationInstallationResult = IntegrationImportResult & {
    installation: IntegrationInstallation;
    run: IntegrationRun;
};

export { integrationInstallationId };

export async function runIntegrationInstallation(
    request: RunIntegrationInstallationCreateRequest | RunIntegrationInstallationRerunRequest,
): Promise<RunIntegrationInstallationResult> {
    return request.mode === "create" ? runCreate(request) : runRerun(request);
}
