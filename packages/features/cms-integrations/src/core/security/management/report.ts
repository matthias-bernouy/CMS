import type {
    IntegrationHealthReport,
    IntegrationHealthStatus,
    IntegrationHealthCheckStatus,
    IntegrationHealthOperation,
} from "../../../interfaces/Integration/management";
import { IntegrationInputError } from "../../errors";
const statuses = new Set<unknown>(["needs_configuration", "ready", "degraded", "blocked", "unknown"]);
const checkStatuses = new Set<unknown>(["ok", "warning", "error", "unknown"]);
export function parseHealthReport(value: unknown, actionIds: readonly string[], now: Date): IntegrationHealthReport {
    if (
        !record(value) ||
        value.schemaVersion !== 1 ||
        !statuses.has(value.status) ||
        typeof value.checkedAt !== "string" ||
        !Number.isFinite(Date.parse(value.checkedAt)) ||
        Date.parse(value.checkedAt) > now.getTime() + 60_000 ||
        !record(value.configuration) ||
        !revision(value.configuration.savedRevision) ||
        !revision(value.configuration.appliedRevision) ||
        !Array.isArray(value.checks) ||
        value.checks.length > 100
    ) {
        invalid();
    }
    const checks = value.checks.map((check) => {
        if (
            !record(check) ||
            typeof check.id !== "string" ||
            !/^[A-Za-z0-9_.:-]{1,200}$/.test(check.id) ||
            !checkStatuses.has(check.status)
        ) {
            invalid();
        }
        for (const key of ["code", "message"]) {
            if (check[key] !== undefined && (typeof check[key] !== "string" || check[key].length > 2_000)) {
                invalid();
            }
        }
        if (
            check.actionIds !== undefined &&
            (!Array.isArray(check.actionIds) ||
                check.actionIds.some((id) => typeof id !== "string" || !actionIds.includes(id)))
        ) {
            invalid();
        }
        return {
            id: check.id,
            status: check.status as IntegrationHealthCheckStatus,
            ...(typeof check.code === "string" ? { code: check.code } : {}),
            ...(typeof check.message === "string" ? { message: check.message } : {}),
            ...(Array.isArray(check.actionIds) ? { actionIds: check.actionIds as string[] } : {}),
        };
    });
    if (new Set(checks.map(({ id }) => id)).size !== checks.length) {
        invalid();
    }
    return {
        schemaVersion: 1,
        status: value.status as IntegrationHealthStatus,
        checkedAt: value.checkedAt,
        configuration: {
            savedRevision: value.configuration.savedRevision as string | null,
            appliedRevision: value.configuration.appliedRevision as string | null,
        },
        checks,
        ...(value.operation !== undefined ? { operation: parseOperation(value.operation) } : {}),
    };
}
function revision(value: unknown): boolean {
    return value === null || (typeof value === "string" && value.length > 0 && value.length <= 200);
}
export function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(): never {
    throw new IntegrationInputError("health", "invalid integration health report");
}

function parseOperation(value: unknown): IntegrationHealthOperation {
    if (
        !record(value) ||
        typeof value.id !== "string" ||
        !value.id ||
        !["running", "succeeded", "failed"].includes(String(value.status)) ||
        !Array.isArray(value.steps) ||
        value.steps.length > 100
    ) {
        invalid();
    }
    const steps = value.steps.map((step) => {
        if (
            !record(step) ||
            typeof step.id !== "string" ||
            !step.id ||
            !["pending", "running", "succeeded", "failed"].includes(String(step.status))
        ) {
            invalid();
        }
        return { id: step.id, status: step.status as IntegrationHealthOperation["steps"][number]["status"] };
    });
    return { id: value.id, status: value.status as IntegrationHealthOperation["status"], steps };
}
