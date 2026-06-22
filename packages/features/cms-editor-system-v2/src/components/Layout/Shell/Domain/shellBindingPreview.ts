import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
} from "@bernouy/cms-content/editor";

export const BINDING_PREVIEW_STYLE_ID = "cms-editor-binding-preview-style";

export function syncBindingPreviewCore(
    editorDocument: Document | null,
    viewDocument: Document | null,
    sourceStateForce: string,
): void {
    const editorCore = bindingPreviewCore(editorDocument);
    if (editorCore) {
        editorCore.setAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce, sourceStateForce);
        editorCore.setAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled, "");
    }

    const viewCore = bindingPreviewCore(viewDocument);
    if (viewCore) {
        viewCore.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce);
        viewCore.removeAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled);
    }
}

export function bindingPreviewCore(document: Document | null): HTMLElement | null {
    const root = document?.querySelector<HTMLElement>("[data-cms-editor-root]");
    if (root?.matches(CMS_BINDING_CORE_TAG)) return root;

    return root?.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG)
        ?? document?.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG)
        ?? null;
}

export function syncViewFrameContent(
    editorDocument: Document | null,
    viewDocument: Document | null,
    sourceStateForce: string,
): void {
    const editorContent = editorDocument?.querySelector<HTMLElement>("[data-cms-content]");
    const viewContent = viewDocument?.querySelector<HTMLElement>("[data-cms-content]");
    if (!editorContent || !viewContent) return;

    viewContent.innerHTML = editorContent.innerHTML;
    syncBindingPreviewCore(editorDocument, viewDocument, sourceStateForce);
    restartViewBindingRuntime(viewDocument);
}

export function restartViewBindingRuntime(viewDocument: Document | null): void {
    const core = bindingPreviewCore(viewDocument) as (HTMLElement & {
        runtime?: { stop(): void } | null;
        startRuntime?: () => void;
    }) | null;
    if (!core || core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)) return;

    core.runtime?.stop();
    core.startRuntime?.();
}

export function injectBindingPreviewStyle(document: Document): void {
    if (document.getElementById(BINDING_PREVIEW_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = BINDING_PREVIEW_STYLE_ID;
    style.textContent = bindingPreviewCss();
    (document.head ?? document.documentElement).append(style);
}

export function bindingPreviewCss(): string {
    const core = `${CMS_BINDING_CORE_TAG}[${CMS_BINDING_ATTRIBUTES.bindingDisabled}]`;
    const source = `[${CMS_BINDING_ATTRIBUTES.source}]`;
    const slot = CMS_BINDING_ATTRIBUTES.slot;
    const state = CMS_BINDING_ATTRIBUTES.sourceStateForce;

    return [
        `${core}[${state}="loaded"] ${source} > [${slot}]{display:none!important}`,
        `${core}[${state}="loading"] ${source} > :not([${slot}="loading"]){display:none!important}`,
        `${core}[${state}="empty"] ${source} > :not([${slot}="empty"]){display:none!important}`,
        `${core}[${state}="error"] ${source} > :not([${slot}="error"]){display:none!important}`,
    ].join("\n");
}
