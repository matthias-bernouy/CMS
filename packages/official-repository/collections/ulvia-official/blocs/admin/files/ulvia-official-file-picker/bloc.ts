import { createBlocScope } from "@bernouy/cms-content/browser";

export const FILE_SELECTED_EVENT = "ulvia-file:selected";

type SelectedFile = Readonly<{
    path: string;
    name: string;
    mimeType: string;
}>;

export function mount(root: HTMLElement): () => void {
    const scope = createBlocScope(root);
    const select = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const button = target.closest<HTMLButtonElement>("[data-file-path]");
        if (!button || button.parentElement?.closest("[cms-bloc]") !== root) {
            return;
        }
        const detail: SelectedFile = {
            path: button.dataset.filePath ?? "",
            name: button.dataset.fileName ?? "",
            mimeType: button.dataset.fileMimeType ?? "",
        };
        if (!detail.path) {
            return;
        }
        root.dispatchEvent(new CustomEvent<SelectedFile>(FILE_SELECTED_EVENT, { bubbles: true, detail }));
    };
    root.addEventListener("click", select);
    return () => root.removeEventListener("click", select);
}
