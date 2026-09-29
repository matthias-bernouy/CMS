import { escapeHtml as esc } from "@bernouy/http-runner/html";
import type {
    PageIndexingEditorCandidate,
    PageIndexingEditorModel,
} from "cms-control/core/content/page/indexing/pageIndexingEditor";

export function pageIndexingSettingsView(model: PageIndexingEditorModel): string {
    const notice = editorNotice(model, model.selection);
    return `
        <style>
            :host { display: block; }
            :host([data-disabled]) .binding,
            :host([data-disabled]) .projection,
            :host([data-disabled]) .notice { display: none; }
            .binding { display: grid; gap: .375rem; }
            .label { color: var(--text-muted); font-size: .75rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
            .value { color: var(--text-main); font-size: .875rem; }
            .notice { color: var(--color-text-muted, #5f6875); font-size: .875rem; margin: .75rem 0 0; }
            .notice[hidden] { display: none; }
            .projection { margin-top: .75rem; display: grid; gap: .5rem; }
            .projection label { display: grid; gap: .25rem; color: var(--text-muted); font-size: .8rem; }
            .projection input, .projection select { width: 100%; padding: .45rem; border: 1px solid var(--border-color, #bcc5ce); border-radius: .35rem; background: var(--bg-base, #fff); color: var(--text-main); }
        </style>
        ${bindingView(model)}
        ${projectionView(model)}
        <p class="notice" data-notice${notice ? "" : " hidden"}>${esc(notice)}</p>
    `;
}

function projectionView(model: PageIndexingEditorModel): string {
    if (model.candidates.length === 0) {
        return "";
    }
    const definition = model.definition;
    const discover = definition?.discover;
    const pagination = discover?.pagination;
    const field = (name: string, label: string, value = "", type = "text") =>
        `<label>${esc(label)}<input data-projection="${name}" type="${type}" value="${esc(value)}"></label>`;
    return `<details class="projection" data-projection-settings>
        <summary>Dynamic URL discovery and metadata</summary>
        <p>Choose a public list capability to include dynamic URLs in the sitemap.</p>
        ${field("identityPath", "Canonical identity response field", definition?.resolve.identityPath ?? "")}
        <label>Public list capability<select data-projection="discoverCapability">
            <option value="">No dynamic URL discovery</option>
            ${(model.discoverOptions ?? []).map((option) => `<option value="${esc(option.value)}"${option.value === `${definition?.contractId}|${discover?.capabilityId}` ? " selected" : ""}>${esc(option.label)}</option>`).join("")}
        </select></label>
        ${field("itemsPath", "List items response field", discover?.itemsPath ?? "items")}
        ${field("discoverIdentityPath", "Item identity field", discover?.identityPath ?? "id")}
        ${field("lastModifiedPath", "Last modified field (optional)", discover?.lastModifiedPath ?? "")}
        <label>Pagination<select data-projection="paginationType">
            <option value=""${!pagination ? " selected" : ""}>Single response</option>
            <option value="offset"${pagination?.type === "offset" ? " selected" : ""}>Offset</option>
            <option value="cursor"${pagination?.type === "cursor" ? " selected" : ""}>Cursor</option>
        </select></label>
        ${field("limitParam", "Page size input field", pagination?.limitParam ?? "limit")}
        ${field("pageSize", "Page size", pagination?.pageSize?.toString() ?? "100", "number")}
        ${field("offsetParam", "Offset input field", pagination?.type === "offset" ? pagination.offsetParam : "offset")}
        ${field("totalPath", "Total count response field (optional)", pagination?.type === "offset" ? (pagination.totalPath ?? "") : "")}
        ${field("cursorParam", "Cursor input field", pagination?.type === "cursor" ? pagination.cursorParam : "cursor")}
        ${field("nextCursorPath", "Next cursor response field", pagination?.type === "cursor" ? pagination.nextCursorPath : "nextCursor")}
    </details>`;
}

export function editorNotice(model: PageIndexingEditorModel, selection: string): string {
    if (!model.selectionValid && !selection) {
        return "The saved dynamic content is no longer present on this page. Select another content type or turn indexing off.";
    }
    if (!selection && model.detectionStatus === "ambiguous") {
        return "Several dynamic content types were detected. Select the one that defines this page.";
    }
    return "";
}

export function selectedCandidate(
    candidates: PageIndexingEditorCandidate[],
    selection: string,
): PageIndexingEditorCandidate | undefined {
    return candidates.find(({ value }) => value === selection);
}

export function variableText(availableVariables: string[], candidate: PageIndexingEditorCandidate | undefined): string {
    const variables = [...(candidate?.variables ?? []), ...availableVariables];
    if (!variables.length) {
        return "";
    }
    return `Available variables: ${variables.map((name) => `\${${name}}`).join(", ")}`;
}

function bindingView(model: PageIndexingEditorModel): string {
    if (model.candidates.length === 0) {
        return "";
    }
    if (model.candidates.length === 1) {
        return `
            <div class="binding">
                <span class="label">Dynamic content</span>
                <span class="value">${esc(model.candidates[0]?.label ?? "")}</span>
            </div>
        `;
    }
    return `
        <div class="binding">
            <p9r-select data-candidate label="Dynamic content" value="${esc(model.selection)}">
                <option value="">Select dynamic content</option>
                ${model.candidates.map((candidate) => `<option value="${esc(candidate.value)}">${esc(candidate.label)}</option>`).join("")}
            </p9r-select>
        </div>
    `;
}
