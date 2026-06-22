import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";

import type { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import {
    injectBindingPreviewStyle,
    syncBindingPreviewCore,
    syncViewFrameContent,
} from "../Domain/shellBindingPreview";
import { contentHtml } from "../Domain/Structure/structureDocument";
import type { CmsSourceStateForce } from "@bernouy/cms-content/editor";
import type { EditorDocument } from "@bernouy/cms-content/editor";

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

export class ShellFrames {
    frameDocument: Document | null = null;
    viewFrameDocument: Document | null = null;

    bindFrameDocument(document: Document, onFrameClick: EventListener): void {
        this.unbindFrameDocument(onFrameClick);
        this.frameDocument = document;
        document.addEventListener("click", onFrameClick, true);
        this.injectBindingPreviewStyle(document);
    }

    bindViewFrameDocument(document: Document): void {
        this.viewFrameDocument = document;
        this.injectBindingPreviewStyle(document);
    }

    unbindFrameDocument(onFrameClick: EventListener): void {
        this.frameDocument?.removeEventListener("click", onFrameClick, true);
        this.frameDocument = null;
    }

    unbindViewFrameDocument(): void {
        this.viewFrameDocument = null;
    }

    syncBindingPreviewCore(sourceStateForce: CmsSourceStateForce): void {
        syncBindingPreviewCore(this.frameDocument, this.viewFrameDocument, sourceStateForce);
    }

    syncViewFrameContent(sourceStateForce: CmsSourceStateForce): void {
        syncViewFrameContent(this.frameDocument, this.viewFrameDocument, sourceStateForce);
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
        const root = document.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? document.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = document.querySelector<HTMLElement>("[data-cms-content]");
        if (!root || !contentRoot) {
            callbacks.clearDocument();
            callbacks.renderStructure();
            callbacks.settings().setSettings([]);
            return;
        }

        callbacks.loadDocument({ root, contentRoot });
        callbacks.syncBindingPreviewCore();
    }

    private injectBindingPreviewStyle(document: Document): void {
        injectBindingPreviewStyle(document);
    }
}

export function eventElement(event: Event): Element | null {
    const target = event.target;
    if (!target || !("nodeType" in target)) return null;
    if (target.nodeType === Node.ELEMENT_NODE) return target as Element;
    return (target as Node).parentElement;
}
