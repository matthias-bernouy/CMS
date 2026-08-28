import { EDITOR_V2_SAVE_DOCUMENT_EVENT, Shell, type EditorV2SaveDocumentDetail } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { loadDocumentConfig } from "./documentLoad";
import { saveDocument } from "./documentMutations";
import { currentPageIdentifier } from "./resource";
import { configureShellCatalogAndFrame } from "./shellSetup";

const configuredShells = new WeakSet<Shell>();
const saveDocumentListener: EventListener = (event) => {
    void onSaveDocument(event as CustomEvent<EditorV2SaveDocumentDetail>);
};

function configureShell(shell: Element): void {
    if (!(shell instanceof Shell) || !isDocumentEditorShell(shell) || configuredShells.has(shell)) {
        return;
    }

    configuredShells.add(shell);
    shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, saveDocumentListener);

    void configureShellCatalogAndFrame(shell);
    const documentId = currentPageIdentifier();
    if (documentId) {
        configurePageManagement(shell, documentId);
        void loadDocumentConfig(shell, documentId);
    }
}

function configurePageManagement(shell: Shell, documentId: string): void {
    const detailUrl = `${getMetaBasePath()}/admin/pages/detail?id=${encodeURIComponent(documentId)}`;
    shell.setAttribute("back-href", detailUrl);
    shell.setAttribute("settings-href", detailUrl);
    shell.setAttribute("settings-label", "Page details");
    shell.setAttribute("hide-delete", "");
}

export function isDocumentEditorShell(shell: Element): boolean {
    return shell.getAttribute("resource") !== "site-bloc";
}

async function onSaveDocument(event: CustomEvent<EditorV2SaveDocumentDetail>): Promise<void> {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell)) {
        return;
    }

    try {
        await saveDocument(event.detail.page, event.detail.content);
        shell.setSaveStatus("Saved");
    } catch (error) {
        console.error("[editor] save failed", error);
        shell.setSaveStatus("Save failed");
    }
}

function configureExistingShells(): void {
    document.querySelectorAll("cms-editor-shell").forEach(configureShell);
}

function configureAddedShells(node: Node): void {
    if (!(node instanceof Element)) {
        return;
    }
    if (node.matches("cms-editor-shell")) {
        configureShell(node);
    }
    node.querySelectorAll("cms-editor-shell").forEach(configureShell);
}

export function observeAddedEditorShells(root: Element): MutationObserver {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(configureAddedShells);
        }
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
}

function startShellBootstrap(): void {
    configureExistingShells();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", configureExistingShells, { once: true });
    }

    observeAddedEditorShells(document.documentElement);
}

if (customElements.get("cms-editor-shell")) {
    startShellBootstrap();
} else {
    void customElements.whenDefined("cms-editor-shell").then(startShellBootstrap);
}
