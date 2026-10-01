import type { ImportedProvider } from "../rows";
import "./CustomProviderImport";
import type { CustomProviderImport } from "./CustomProviderImport";

type ModalControl = HTMLElement & { showModal(): void; hide(): void };

export function bindCustomProviderFlow(root: ShadowRoot, onImported: (provider: ImportedProvider) => void): void {
    const modal = root.querySelector("[data-custom-modal]") as ModalControl;
    const importer = root.querySelector("cms-custom-provider-import") as CustomProviderImport;
    root.querySelector("[data-custom-provider]")!.addEventListener("click", () => {
        importer.reset();
        modal.showModal();
    });
    importer.addEventListener("provider-manifest-imported", (event) => {
        modal.hide();
        onImported((event as CustomEvent<ImportedProvider>).detail);
    });
}
