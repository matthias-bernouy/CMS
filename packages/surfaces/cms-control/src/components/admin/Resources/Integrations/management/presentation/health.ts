import type { IntegrationHealthEnvelope, IntegrationManagement } from "@bernouy/cms-integrations";

export function renderHealth(
    root: HTMLElement,
    health: IntegrationHealthEnvelope,
    management: IntegrationManagement,
    run: (id: string) => void,
): void {
    root.replaceChildren();
    const report = health.report;
    appendText(
        root,
        "p",
        `Observation: ${label(health.observation)} · ${label(health.freshness)} · ${date(health.observedAt)}`,
    );
    if (!report) {
        appendText(root, "p", "No valid service observation is available.");
        return;
    }
    appendText(
        root,
        "h3",
        `${health.freshness === "fresh" ? "Service" : "Last observed service"}: ${label(report.status)}`,
    );
    appendText(root, "p", `Checked ${date(report.checkedAt)}`);
    appendText(
        root,
        "p",
        report.configuration.savedRevision === report.configuration.appliedRevision
            ? "The saved configuration is applied."
            : "Saved changes are waiting to be applied.",
    );
    for (const check of report.checks) {
        const row = document.createElement("article");
        row.className = "management-check";
        row.dataset.checkId = check.id;
        appendText(row, "strong", `${label(check.status)} · ${check.message || check.code || check.id}`);
        for (const id of check.actionIds ?? []) {
            const action = management.actions?.find((candidate) => candidate.id === id);
            if (action || (id === "apply-settings" && management.settings?.applyFunctionId)) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = action?.label ?? "Apply configuration";
                button.addEventListener("click", () => run(id));
                row.append(button);
            }
        }
        root.append(row);
    }
    if (report.operation) {
        appendText(root, "h3", `Operation ${report.operation.id}: ${label(report.operation.status)}`);
        for (const step of report.operation.steps) {
            appendText(root, "p", `${step.id}: ${label(step.status)}`);
        }
    }
}
function appendText(root: HTMLElement, tag: string, text: string): void {
    const node = document.createElement(tag);
    node.textContent = text;
    root.append(node);
}
function date(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
function label(value: string): string {
    return value.replaceAll("_", " ");
}
