import { rerunIntegrationInstallation } from "../api";
import type { IntegrationInstallationDetail } from "../model";
import { handleCollectionSelection, renderCollectionSelection, selectedCollectionResources } from "../ui/resources";

export function renderCollectionSettings(
    root: HTMLElement,
    installation: IntegrationInstallationDetail,
    status: (message: string) => void,
): void {
    const definition = installation.definition;
    if (definition?.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return;
    }
    const selection = document.createElement("div");
    selection.dataset.collectionSelection = "";
    const hint = document.createElement("p");
    hint.textContent =
        "Select the blocs available for new content in the editor. Existing pages keep rendering their blocs.";
    renderCollectionSelection(selection, definition, installation.activeResources);
    selection.addEventListener("click", (event) => {
        if (event.target instanceof Element) {
            handleCollectionSelection(event.target, definition);
        }
    });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Save active blocs";
    button.addEventListener("click", async () => {
        button.disabled = true;
        status("Saving active blocs…");
        try {
            await rerunIntegrationInstallation(installation.id, undefined, selectedCollectionResources(selection));
            status("Active blocs saved.");
        } catch (error) {
            status(error instanceof Error ? error.message : "Unable to save active blocs.");
        } finally {
            button.disabled = false;
        }
    });
    root.replaceChildren(hint, selection, button);
}
