import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    IntegrationCompatibilityReportPageRequest,
    IntegrationCompatibilityReportStore,
    IntegrationRegistryCatalogSnapshotProvider,
    IntegrationRegistryRecoveryDiagnostic,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import type { RepositoryManagementOperationalReadSource } from "./observability/contracts";
import { projectRepositoryOperationalRead } from "./observability/projection";

export type { RepositoryManagementOperationalReadSource } from "./observability/contracts";

export const REPOSITORY_STATUS_PATH = "/api/status";
export const REPOSITORY_DIAGNOSTICS_PATH = "/api/diagnostics";
export const REPOSITORY_VERSIONS_PATH = "/api/integrations/versions";
export const REPOSITORY_COMPATIBILITY_PATH = "/api/integrations/compatibility";

const MAX_COMPATIBILITY_PAGE_SIZE = 100;

export type RepositoryManagementReadConfig = Readonly<{
    catalog: IntegrationRegistryCatalogSnapshotProvider;
    reports: IntegrationCompatibilityReportStore;
    recoveryDiagnostics?: () => readonly IntegrationRegistryRecoveryDiagnostic[];
    operational?: RepositoryManagementOperationalReadSource;
}>;

export function mountRepositoryManagementReadRoutes(runner: Runner, config: RepositoryManagementReadConfig): void {
    runner.get(REPOSITORY_STATUS_PATH, () => statusResponse(config));
    runner.get(REPOSITORY_DIAGNOSTICS_PATH, () => diagnosticsResponse(config));
    runner.get(REPOSITORY_VERSIONS_PATH, (request) => versionsResponse(request, config));
    runner.get(REPOSITORY_COMPATIBILITY_PATH, (request) => compatibilityResponse(request, config));
}

async function statusResponse(config: RepositoryManagementReadConfig): Promise<Response> {
    const snapshot = config.catalog.current();
    const versions = snapshot.summaries.reduce((total, summary) => total + summary.versions.length, 0);
    const snapshotMetric = {
        integrations: snapshot.summaries.length,
        versions,
        diagnostics: snapshot.diagnostics.length,
        quarantined: snapshot.quarantined.length,
        recoveryDiagnostics: config.recoveryDiagnostics?.().length ?? 0,
    };
    const operational = config.operational
        ? await projectRepositoryOperationalRead(config.operational, snapshotMetric)
        : undefined;
    return jsonResponse({
        ready: true,
        health: snapshot.health,
        ...snapshotMetric,
        ...(operational ? { metrics: operational.metrics } : {}),
    });
}

async function diagnosticsResponse(config: RepositoryManagementReadConfig): Promise<Response> {
    const snapshot = config.catalog.current();
    const recovery = config.recoveryDiagnostics?.() ?? [];
    const operational = config.operational
        ? await projectRepositoryOperationalRead(config.operational, {
              integrations: snapshot.summaries.length,
              versions: snapshot.summaries.reduce((total, summary) => total + summary.versions.length, 0),
              diagnostics: snapshot.diagnostics.length,
              quarantined: snapshot.quarantined.length,
              recoveryDiagnostics: recovery.length,
          })
        : undefined;
    return jsonResponse({
        health: snapshot.health,
        diagnostics: snapshot.diagnostics.map(({ source: _source, ...diagnostic }) => diagnostic),
        quarantined: snapshot.quarantined.map(({ source: _source, ...entry }) => entry),
        recovery: recovery.map(({ source: _source, ...diagnostic }) => diagnostic),
        ...(operational ? { metrics: operational.metrics, recentOperations: operational.recentOperations } : {}),
    });
}

async function versionsResponse(request: Request, config: RepositoryManagementReadConfig): Promise<Response> {
    try {
        const kind = requiredParam(request, "kind");
        assertIntegrationPackageKind(kind);
        const snapshot = config.catalog.current();
        const index = snapshot.getIndex(kind);
        if (!index) {
            return errorResponse(404, "integration_not_found", "Integration was not found");
        }
        const versions = await Promise.all(
            snapshot.listVersions(kind).map(async ({ version, status }) => {
                const location = snapshot.locateExactVersion(kind, version);
                const history = await config.reports.get(kind, version);
                return {
                    version,
                    digest: location?.package.digest,
                    ...(status ? { status } : {}),
                    compatibility: history
                        ? {
                              admissionReportId: history.admission.id,
                              currentReportRevisionId: history.current.id,
                              outcome: history.current.outcome,
                              admissible: history.current.admissible,
                              warning: history.current.id !== history.admission.id && !history.current.admissible,
                          }
                        : null,
                };
            }),
        );
        return jsonResponse({ kind, stable: index.stable, latest: index.latest, versions });
    } catch (error) {
        return invalidRequest(error);
    }
}

async function compatibilityResponse(request: Request, config: RepositoryManagementReadConfig): Promise<Response> {
    try {
        const kind = requiredParam(request, "kind");
        const version = requiredParam(request, "version");
        assertIntegrationPackageKind(kind);
        assertIntegrationPackageVersion(version);
        const page = await config.reports.list(kind, version, compatibilityPage(request));
        return page
            ? jsonResponse(page)
            : errorResponse(404, "compatibility_history_not_found", "Compatibility history was not found");
    } catch (error) {
        return invalidRequest(error);
    }
}

function compatibilityPage(request: Request): IntegrationCompatibilityReportPageRequest {
    const params = new URL(request.url).searchParams;
    const after = optionalParam(params.get("after"));
    const limitText = optionalParam(params.get("limit"));
    if (!limitText) {
        return after ? { after } : {};
    }
    if (!/^[1-9][0-9]*$/u.test(limitText)) {
        throw new TypeError("limit must be a positive integer");
    }
    const limit = Number(limitText);
    if (!Number.isSafeInteger(limit) || limit > MAX_COMPATIBILITY_PAGE_SIZE) {
        throw new TypeError(`limit must not exceed ${MAX_COMPATIBILITY_PAGE_SIZE}`);
    }
    return after ? { after, limit } : { limit };
}

function requiredParam(request: Request, name: string): string {
    const value = optionalParam(new URL(request.url).searchParams.get(name));
    if (!value) {
        throw new TypeError(`${name} is required`);
    }
    return value;
}

function optionalParam(value: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
}

function invalidRequest(error: unknown): Response {
    const message = error instanceof Error ? error.message : "Management request is invalid";
    return errorResponse(400, "management_request_invalid", message);
}

function jsonResponse(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(status: number, code: string, error: string): Response {
    return jsonResponse({ code, error }, status);
}
