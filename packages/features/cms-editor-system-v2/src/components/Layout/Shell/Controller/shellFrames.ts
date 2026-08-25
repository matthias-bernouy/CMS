import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";

import type { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import {
    injectBindingPreviewStyle,
    syncBindingPreviewCore,
    syncViewFrameContent,
} from "../Domain/Bindings/shellBindingPreview";
import { contentHtml } from "../Domain/Structure/structureDocument";
import { injectInlineTextEditingStyle } from "../Domain/Settings/inlineTextEditing";
import type { CmsSourceStateForce } from "@bernouy/cms-content/editor";
import type { EditorDocument } from "@bernouy/cms-content/editor";
import type { EditorPreviewMode } from "./shellTypes";

type FrameReadyCallbacks = {
    bindViewFrameDocument(document: Document): void;
    bindFrameDocument(document: Document): void;
    syncViewFrameContent(): void;
    syncBindingPreviewCore(): void;
    loadDocument(document: EditorDocument): void;
    clearDocument(): void;
    renderStructure(): void;
    settings(): SettingsView;
};

export type ShellFrameEventHandlers = {
    click: EventListener;
    focusout: EventListener;
    input: EventListener;
    keydown: EventListener;
    paste: EventListener;
    pointerdown: EventListener;
};

export class ShellFrames {
    frameDocument: Document | null = null;
    viewFrameDocument: Document | null = null;

    bindFrameDocument(document: Document, handlers: ShellFrameEventHandlers): void {
        this.unbindFrameDocument(handlers);
        this.frameDocument = document;
        document.addEventListener("click", handlers.click, true);
        document.addEventListener("focusout", handlers.focusout, true);
        document.addEventListener("input", handlers.input, true);
        document.addEventListener("keydown", handlers.keydown, true);
        document.addEventListener("paste", handlers.paste, true);
        document.addEventListener("pointerdown", handlers.pointerdown, true);
        this.injectBindingPreviewStyle(document);
        injectInlineTextEditingStyle(document);
    }

    bindViewFrameDocument(document: Document, previewMode: EditorPreviewMode = "mirrored"): void {
        this.viewFrameDocument = document;
        if (previewMode === "mirrored") {
            this.injectBindingPreviewStyle(document);
        }
    }

    unbindFrameDocument(handlers: ShellFrameEventHandlers): void {
        this.frameDocument?.removeEventListener("click", handlers.click, true);
        this.frameDocument?.removeEventListener("focusout", handlers.focusout, true);
        this.frameDocument?.removeEventListener("input", handlers.input, true);
        this.frameDocument?.removeEventListener("keydown", handlers.keydown, true);
        this.frameDocument?.removeEventListener("paste", handlers.paste, true);
        this.frameDocument?.removeEventListener("pointerdown", handlers.pointerdown, true);
        this.frameDocument = null;
    }

    unbindViewFrameDocument(): void {
        this.viewFrameDocument = null;
    }

    syncBindingPreviewCore(
        sourceStateForce: CmsSourceStateForce,
        viewActive: boolean,
        previewMode: EditorPreviewMode = "mirrored",
    ): void {
        const viewDocument = previewMode === "mirrored" ? this.viewFrameDocument : null;
        syncBindingPreviewCore(this.frameDocument, viewDocument, sourceStateForce, viewActive);
    }

    syncViewFrameContent(
        sourceStateForce: CmsSourceStateForce,
        viewActive: boolean,
        previewMode: EditorPreviewMode = "mirrored",
    ): void {
        if (previewMode === "external") {
            return;
        }
        syncViewFrameContent(this.frameDocument, this.viewFrameDocument, sourceStateForce, viewActive);
    }

    contentHtml(): string {
        return contentHtml(this.frameDocument);
    }

    handleFrameReady(kind: "editor" | "view", document: Document, callbacks: FrameReadyCallbacks): void {
        if (kind === "view") {
            callbacks.bindViewFrameDocument(document);
            callbacks.syncViewFrameContent();
            callbacks.syncBindingPreviewCore();
            return;
        }

        callbacks.bindFrameDocument(document);
        const root =
            document.querySelector<HTMLElement>("[data-cms-editor-root]") ??
            document.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = document.querySelector<HTMLElement>("[data-cms-content]");
        if (!root || !contentRoot) {
            callbacks.clearDocument();
            callbacks.renderStructure();
            callbacks.settings().setSettings([]);
            return;
        }

        callbacks.loadDocument({ root, contentRoot });
        callbacks.syncBindingPreviewCore();
        callbacks.syncViewFrameContent();
    }

    private injectBindingPreviewStyle(document: Document): void {
        injectBindingPreviewStyle(document);
    }
}

export function eventElement(event: Event): Element | null {
    const target = event.target;
    if (!target || !("nodeType" in target)) {
        return null;
    }
    if (target.nodeType === Node.ELEMENT_NODE) {
        return target as Element;
    }
    return (target as Node).parentElement;
}
