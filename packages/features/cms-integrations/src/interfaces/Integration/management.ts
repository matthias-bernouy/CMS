import type { DashboardField } from "@bernouy/cms-dashboards";

export type IntegrationHealthStatus = "needs_configuration" | "ready" | "degraded" | "blocked" | "unknown";
export type IntegrationHealthCheckStatus = "ok" | "warning" | "error" | "unknown";
export type IntegrationManagementActor = { id: string; role: string };
export type IntegrationHealthOperation = {
    id: string;
    status: "running" | "succeeded" | "failed";
    steps: Array<{ id: string; status: "pending" | "running" | "succeeded" | "failed" }>;
};
export type IntegrationManagement = {
    schemaVersion: 1;
    health?: { functionId: string };
    settings?: {
        readFunctionId: string;
        saveFunctionId: string;
        applyFunctionId?: string;
        fields: DashboardField[];
        dashboardId?: string;
    };
    actions?: Array<{ id: string; label: string; functionId: string }>;
    /** Existing owned generated-secret slots allowed for management reads and writes. */
    generatedSecrets?: string[];
    /** Environment bindings applied through the installation's configured connector. */
    runtimeSecrets?: Record<string, { field: string } | { generated: string }>;
};
export type IntegrationHealthReport = {
    schemaVersion: 1;
    status: IntegrationHealthStatus;
    checkedAt: string;
    configuration: { savedRevision: string | null; appliedRevision: string | null };
    operation?: IntegrationHealthOperation;
    checks: Array<{
        id: string;
        status: IntegrationHealthCheckStatus;
        code?: string;
        message?: string;
        actionIds?: string[];
    }>;
};
export type IntegrationHealthEnvelope = {
    schemaVersion: 1;
    installationId: string;
    observedAt: string;
    freshness: "fresh" | "stale" | "unavailable";
    reason?: "timeout" | "unauthorized" | "forbidden" | "unreachable" | "invalid_report" | "unsupported";
    httpStatus?: number;
    reportDefinitionVersion?: string;
    observation: "valid" | "unreachable" | "invalid_report" | "unsupported";
    report: IntegrationHealthReport | null;
};
export type IntegrationSettingsResponse = {
    values: Record<string, unknown>;
    savedRevision: string | null;
    appliedRevision: string | null;
};
export type IntegrationManagementOperation =
    | "health"
    | "read-settings"
    | "save-settings"
    | "apply-settings"
    | "confirm-apply"
    | "action";
export type IntegrationManagementInvocation = {
    operation: IntegrationManagementOperation;
    actor?: IntegrationManagementActor;
    actionId?: string;
    resolvedPages?: Record<string, import("../IntegrationImport").IntegrationResolvedPage>;
    installationId: string;
    definitionVersion: string;
    input: Record<string, unknown>;
    secretValues: Record<string, string>;
    generatedSecretValues: Record<string, string>;
};
