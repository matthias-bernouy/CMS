import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { serializableContentHtml } from "../Structure/structureDocument";

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
    if (root?.matches(CMS_BINDING_CORE_TAG)) {
        return root;
    }

    return (
        root?.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG) ??
        document?.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG) ??
        null
    );
}

export function syncViewFrameContent(
    editorDocument: Document | null,
    viewDocument: Document | null,
    sourceStateForce: string,
): void {
    const editorContent = editorDocument?.querySelector<HTMLElement>("[data-cms-content]");
    const viewContent = viewDocument?.querySelector<HTMLElement>("[data-cms-content]");
    if (!editorContent || !viewContent) {
        return;
    }

    viewContent.innerHTML = serializableContentHtml(editorContent);
    syncBindingPreviewCore(editorDocument, viewDocument, sourceStateForce);
    restartViewBindingRuntime(viewDocument);
}

export function restartViewBindingRuntime(viewDocument: Document | null): void {
    const core = bindingPreviewCore(viewDocument) as BindingPreviewCoreElement | null;
    if (!core || core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)) {
        return;
    }

    if (startViewBindingRuntime(core)) {
        return;
    }

    viewDocument?.defaultView?.customElements
        .whenDefined(core.localName)
        .then(() => {
            viewDocument.defaultView?.customElements.upgrade(core);
            if (!core.isConnected || core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)) {
                return;
            }
            startViewBindingRuntime(core);
        })
        .catch(() => undefined);
}

type BindingPreviewCoreElement = HTMLElement & {
    runtime?: { stop(): void; deactivate?: () => void } | null;
    startRuntime?: () => void;
};

function startViewBindingRuntime(core: BindingPreviewCoreElement): boolean {
    if (typeof core.startRuntime !== "function") {
        return false;
    }

    if (typeof core.runtime?.deactivate === "function") {
        core.runtime.deactivate();
    } else {
        core.runtime?.stop();
    }
    core.startRuntime();
    return true;
}

export function injectBindingPreviewStyle(document: Document): void {
    if (document.getElementById(BINDING_PREVIEW_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = BINDING_PREVIEW_STYLE_ID;
    style.textContent = bindingPreviewCss();
    (document.head ?? document.documentElement).append(style);
}

export function bindingPreviewCss(): string {
    const core = `${CMS_BINDING_CORE_TAG}[${CMS_BINDING_ATTRIBUTES.bindingDisabled}]`;
    const source = `[${CMS_BINDING_ATTRIBUTES.source}]`;
    const condition = CMS_BINDING_ATTRIBUTES.condition;
    const state = CMS_BINDING_ATTRIBUTES.sourceStateForce;
    const hiddenFor = (current: string) => {
        const selectors = [
            `${core}[${state}="${current}"] ${source} [${condition}^="$source."]:not([${condition}*=".${current}"])`,
            `${core}[${state}="${current}"] ${source} [${condition}^="$sources."]:not([${condition}*=".${current}"])`,
        ];
        return `${selectors.join(",")}{display:none!important}`;
    };

    return [hiddenFor("loaded"), hiddenFor("loading"), hiddenFor("empty"), hiddenFor("error")].join("\n");
}
