import { describe, expect, test } from "bun:test";
import { isDocumentEditorShell, observeAddedEditorShells } from "cms-control/components/editorSystemV2/bootstrap";

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Editor shell subtree was not observed");
}

describe("editor shell bootstrap", () => {
    test("leaves site bloc shells to their dedicated builder bootstrap", () => {
        const documentShell = document.createElement("cms-editor-shell");
        const siteBlocShell = document.createElement("cms-editor-shell");
        siteBlocShell.setAttribute("resource", "site-bloc");

        expect(isDocumentEditorShell(documentShell)).toBe(true);
        expect(isDocumentEditorShell(siteBlocShell)).toBe(false);
    });

    test("observes editor shells added inside a new subtree", async () => {
        const root = document.createElement("div");
        const container = document.createElement("section");
        const querySelectorAll = container.querySelectorAll.bind(container);
        let queriedForShells = false;
        container.querySelectorAll = ((selectors: string) => {
            if (selectors === "cms-editor-shell") {
                queriedForShells = true;
            }
            return querySelectorAll(selectors);
        }) as typeof container.querySelectorAll;

        const observer = observeAddedEditorShells(root);
        root.append(container);
        try {
            await waitFor(() => queriedForShells);
            expect(queriedForShells).toBeTrue();
        } finally {
            observer.disconnect();
        }
    });
});
