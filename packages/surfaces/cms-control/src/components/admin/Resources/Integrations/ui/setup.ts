import { renderFields } from "../fields";
import type { IntegrationBrowserHost, IntegrationDefinition } from "../model";
import { renderLinkedPlaceholder } from "./detail";
import { cloneElement, fillIcon, text } from "./templates";
import { renderResourceRows, renderSummary, resourceRows } from "./resources";

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
    renderFields(host.query("[data-fields]"), host.query("[data-field-template]"), definition, options.answers);
}

export function renderImporting(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    answers: Record<string, unknown>,
): void {
    const shell = cloneElement("importing-shell");
    text(shell, "[data-title]", `Installing ${definition.label}`);
    fillIcon(shell, "[data-back-icon]", "table");
    renderSummary(shell.querySelector<HTMLElement>("[data-summary]")!, summaryRows(definition));
    host.query<HTMLElement>("[data-detail-view]").replaceChildren(shell);
}

function summaryRows(definition: IntegrationDefinition): Array<{ label: string; value: unknown }> {
    const rows = resourceRows(definition);
    return [
        { label: "Integration", value: definition.label },
        { label: "Identifier", value: definition.kind },
        { label: "Resources", value: rows.filter((row) => !["Secret", "Connector"].includes(row.type)).length },
        { label: "Secrets", value: rows.filter((row) => row.type === "Secret").length },
        { label: "Connectors", value: rows.filter((row) => row.type === "Connector").length },
    ];
}
