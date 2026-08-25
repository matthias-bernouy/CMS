import { escapeHtml as esc } from "@bernouy/http-runner/html";
import type {
    PageIndexingEditorCandidate,
    PageIndexingEditorModel,
} from "cms-control/core/content/page/pageIndexingEditor";

export function pageIndexingSettingsView(model: PageIndexingEditorModel): string {
    const notice = editorNotice(model, model.selection);
    return `
        <style>
            :host { display: block; }
            :host([data-disabled]) .binding,
            :host([data-disabled]) .notice { display: none; }
            .binding { display: grid; gap: .375rem; }
            .label { color: var(--text-muted); font-size: .75rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
            .value { color: var(--text-main); font-size: .875rem; }
            .notice { color: var(--color-text-muted, #5f6875); font-size: .875rem; margin: .75rem 0 0; }
            .notice[hidden] { display: none; }
        </style>
        ${bindingView(model)}
        <p class="notice" data-notice${notice ? "" : " hidden"}>${esc(notice)}</p>
    `;
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
