import { defaultInstance } from "../domain";
import { renderFields } from "../fields";
import type { IntegrationAnswerValue, IntegrationBrowserHost, IntegrationDefinition } from "../model";
import { renderLinkedPlaceholder } from "./detail";
import { cloneElement, fillIcon, text } from "./templates";
import { previewInstanceId, renderResourceRows, renderSummary, resourceRows } from "./resources";

export function renderSetup(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    options: { answers?: Record<string, unknown>; error?: string } = {},
): void {
    const shell = cloneElement("setup-shell");
    text(shell, "[data-title]", `Install ${definition.label}`);
    fillIcon(shell, "[data-back-icon]", "table");
    const status = shell.querySelector<HTMLElement>("[data-setup-status]")!;
    status.textContent = options.error ?? "";
    status.classList.toggle("is-error", Boolean(options.error));
    renderResourceRows(shell.querySelector<HTMLElement>("[data-resources]")!, resourceRows(definition));
    renderLinkedPlaceholder(shell.querySelector<HTMLElement>("[data-linked]")!);
    renderSummary(shell.querySelector<HTMLElement>("[data-summary]")!, summaryRows(definition));
    host.query<HTMLElement>("[data-detail-view]").replaceChildren(shell);
    renderFields(host.query("[data-fields]"), host.query("[data-field-template]"), definition);
    if (options.answers) applyAnswers(host.query("[data-fields]"), options.answers);
}

export function renderImporting(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    answers: Record<string, unknown>,
): void {
    const shell = cloneElement("importing-shell");
    const instance = previewInstanceId(definition, answers);
    text(shell, "[data-title]", `Installing ${definition.label}`);
    fillIcon(shell, "[data-back-icon]", "table");
    renderSummary(shell.querySelector<HTMLElement>("[data-summary]")!, summaryRows(definition, instance));
    host.query<HTMLElement>("[data-detail-view]").replaceChildren(shell);
}

export function collectImportInstance(definition: IntegrationDefinition, answers: Record<string, IntegrationAnswerValue>) {
    return defaultInstance(definition, answers);
}

function summaryRows(definition: IntegrationDefinition, instanceId = ""): Array<{ label: string; value: unknown }> {
    const rows = resourceRows(definition);
    return [
        { label: "Integration", value: definition.label },
        { label: "Kind", value: definition.kind },
        ...(instanceId ? [{ label: "Instance", value: instanceId }] : []),
        { label: "Resources", value: rows.filter(row => !["Secret", "Connector"].includes(row.type)).length },
        { label: "Secrets", value: rows.filter(row => row.type === "Secret").length },
        { label: "Connectors", value: rows.filter(row => row.type === "Connector").length },
    ];
}

function applyAnswers(root: ParentNode, answers: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(answers)) {
        const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${cssEscape(name)}"]`);
        if (!element) continue;
        if (element instanceof HTMLInputElement && element.type === "checkbox") element.checked = value === true;
        else element.value = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    }
}

function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(value)
        : value.replaceAll('"', '\\"');
}
