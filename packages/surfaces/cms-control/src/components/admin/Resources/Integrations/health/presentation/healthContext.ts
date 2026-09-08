import type { IntegrationHealthEnvelope, IntegrationManagement } from "@bernouy/cms-integrations";
type Check = { id: string; summary: string; actions: { id: string; label: string }[] };
type Step = { id: string; status: string };

/** Stable positional projections; the page binding owns all repeated markup. */
export function healthContext(management: IntegrationManagement) {
    const actions = new Map(
        (management.actions ?? []).map((action) => [action.id, { id: action.id, label: action.label }]),
    );

    let checks: Check[] = [];
    let steps: Step[] = [];
    return (health: IntegrationHealthEnvelope | undefined) => {
        const report = health?.report;
        checks = (report?.checks ?? []).map((check, index) => {
            const previous = checks[index];
            const row = previous?.id === check.id ? previous : { id: check.id, summary: "", actions: [] };
            row.summary = `${label(check.status)} · ${check.message || check.code || check.id}`;
            row.actions = (check.actionIds ?? []).flatMap((id) => {
                const action = actions.get(id);
                return action ? [action] : [];
            });
            return row;
        });
        steps = (report?.operation?.steps ?? []).map((step, index) => {
            const previous = steps[index];
            const row = previous?.id === step.id ? previous : { id: step.id, status: "" };
            row.status = label(step.status);
            return row;
        });
        return {
            healthView: {
                available: Boolean(health),
                hasReport: Boolean(report),
                checks,
                steps,
                observation: health
                    ? `Observation: ${label(health.observation)} · ${label(health.freshness)} · ${date(health.observedAt)}`
                    : "",
                issue: health?.reason
                    ? `Observation issue: ${label(health.reason)}${health.httpStatus ? ` (HTTP ${health.httpStatus})` : ""}`
                    : "",
                version: health?.reportDefinitionVersion ?? "",
                service: report
                    ? `${health!.freshness === "fresh" ? "Service" : "Last observed service"}: ${label(report.status)}`
                    : "",
                checked: report ? `Checked ${date(report.checkedAt)}` : "",
                configuration: report ? configurationStatus(health!) : "",
                operation: report?.operation
                    ? `Operation ${report.operation.id}: ${label(report.operation.status)}`
                    : "",
            },
        };
    };
}

function date(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
function label(value: string): string {
    return value.replaceAll("_", " ");
}

function configurationStatus(health: IntegrationHealthEnvelope): string {
    const { savedRevision, appliedRevision } = health.report!.configuration;
    if (savedRevision === null) {
        return "No saved configuration revision was reported.";
    }
    if (savedRevision !== appliedRevision) {
        return health.freshness === "fresh"
            ? "Saved changes are waiting to be applied."
            : "Saved changes were waiting to be applied at the last observation.";
    }
    return health.freshness === "fresh"
        ? "The saved configuration is applied."
        : "The saved configuration was applied at the last observation.";
}
