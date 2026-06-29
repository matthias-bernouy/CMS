import { artifactSummary } from "./domain";
import { renderFields } from "./fields";
import type { IntegrationDefinition } from "./model";

export const LAST_SETUP_STEP = 2;
type SummaryRow = [kind: string, label: string, detail: string];

export function renderSetup(root: ParentNode, definition: IntegrationDefinition): void {
    renderInfo(root, definition);
    renderFields(
        query(root, "[data-fields]"),
        query(root, "[data-field-template]"),
        definition,
    );
    renderSummary(
        query(root, "[data-summary]"),
        query(root, "[data-summary-template]"),
        definition,
    );
}

export function showSetupStep(root: ParentNode, step: number): void {
    const current = Math.max(0, Math.min(LAST_SETUP_STEP, step));
    for (const panel of Array.from(root.querySelectorAll<HTMLElement>("[data-step-panel]"))) {
        panel.hidden = Number(panel.dataset.stepPanel) !== current;
    }
    for (const item of Array.from(root.querySelectorAll<HTMLElement>("[data-step-indicator]"))) {
        const index = Number(item.dataset.stepIndicator);
        item.classList.toggle("is-active", index === current);
        item.classList.toggle("is-complete", index < current);
    }
    query<HTMLButtonElement>(root, "[data-back]").hidden = current === 0;
    query<HTMLButtonElement>(root, "[data-next]").hidden = current === LAST_SETUP_STEP;
    query<HTMLButtonElement>(root, "[data-import]").hidden = current !== LAST_SETUP_STEP;
}

function renderInfo(root: ParentNode, definition: IntegrationDefinition): void {
    fill(root, "[data-info-kind]", definition.kind);
    fill(root, "[data-info-category]", definition.category ?? "Other");
    fill(root, "[data-info-version]", definition.version ?? "Current");
    fill(root, "[data-info-artifacts]", artifactSummary(definition));
}

function renderSummary(root: HTMLElement, template: HTMLTemplateElement, definition: IntegrationDefinition): void {
    root.replaceChildren();
    for (const [kind, label, detail] of summaryRows(definition)) {
        const item = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
        item.querySelector("[data-kind]")!.textContent = kind;
        item.querySelector("[data-label]")!.textContent = label;
        item.querySelector("[data-detail]")!.textContent = detail;
        root.append(item);
    }
}

function summaryRows(definition: IntegrationDefinition): SummaryRow[] {
    const rows = sourceRows(definition);
    for (const secret of definition.secrets ?? []) {
        rows.push(["Secret", inputLabel(definition, secret.input), secret.key]);
    }
    if (rows.length) return rows;
    if (definition.ui?.resources?.length) return definition.ui.resources.map(([kind, label]) => [kind, label, ""]);
    return [["Artifacts", artifactSummary(definition), ""]];
}

function sourceRows(definition: IntegrationDefinition): SummaryRow[] {
    const rows: SummaryRow[] = [];
    for (const artifact of definition.artifacts ?? []) {
        const source = artifact.source;
        rows.push(["Source", source.meta?.name ?? source.id, `Source id: ${source.id}`]);
        for (const endpoint of source.endpoints) {
            const label = endpoint.meta?.name ?? endpoint.endpointId;
            rows.push(["Endpoint", label, `${endpoint.method} ${endpoint.endpointId}`]);
        }
    }
    return rows;
}

function inputLabel(definition: IntegrationDefinition, name: string): string {
    return definition.inputs.find(input => input.name === name)?.label ?? name;
}

function fill(root: ParentNode, selector: string, value: string): void {
    query<HTMLElement>(root, selector).textContent = value;
}

function query<T extends Element>(root: ParentNode, selector: string): T {
    return root.querySelector(selector) as T;
}
