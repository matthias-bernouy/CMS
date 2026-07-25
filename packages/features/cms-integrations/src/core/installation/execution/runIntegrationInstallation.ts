import { runCreate } from "../create";
import { runRerun, runUpgrade } from "./rerun";
import { integrationInstallationId } from "../ids";
import { reconcileAfterInstallation } from "./afterInstallation";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportResult,
} from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationPackageResolver } from "../../../interfaces/IntegrationConnectorDeployer";

export type RunIntegrationInstallationCreateRequest = {
    mode: "create";
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    dto: IntegrationImportDto;
    siteIntegrations?: IntegrationDefinition[];
    packageResolver?: IntegrationPackageResolver;
};

export type RunIntegrationInstallationRerunRequest = {
    mode: "rerun";
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    integrationId: string;
    body?: Record<string, unknown>;
    siteIntegrations?: IntegrationDefinition[];
    packageResolver?: IntegrationPackageResolver;
};

export type RunIntegrationInstallationUpgradeRequest = {
    mode: "upgrade";
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    integrationId: string;
    targetDefinition: IntegrationDefinition;
    body?: Record<string, unknown>;
    siteIntegrations?: IntegrationDefinition[];
    packageResolver?: IntegrationPackageResolver;
};

export type RunIntegrationInstallationResult = IntegrationImportResult & {
    installation: IntegrationInstallation;
    run: IntegrationRun;
};

export { integrationInstallationId };

export async function runIntegrationInstallation(
    request:
        | RunIntegrationInstallationCreateRequest
        | RunIntegrationInstallationRerunRequest
        | RunIntegrationInstallationUpgradeRequest,
): Promise<RunIntegrationInstallationResult> {
    const result =
        request.mode === "create"
            ? await runCreate(request)
            : request.mode === "upgrade"
              ? await runUpgrade(request)
              : await runRerun(request);
    if (request.mode !== "upgrade") {
        await reconcileAfterInstallation(request.deps, request.installations, result.installation.id);
    }
    return result;
}
