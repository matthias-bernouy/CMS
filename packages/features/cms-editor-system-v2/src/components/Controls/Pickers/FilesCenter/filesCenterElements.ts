export type FilesCenterElements = {
    backdrop: HTMLElement;
    breadcrumb: HTMLElement;
    cancelButton: HTMLButtonElement;
    closeButton: HTMLButtonElement;
    empty: HTMLElement;
    grid: HTMLElement;
    searchInput: HTMLInputElement;
    selectButton: HTMLButtonElement;
    selectionTitle: HTMLElement;
    selectionValue: HTMLElement;
};

export function queryFilesCenterElements(root: ShadowRoot): FilesCenterElements {
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    return {
        backdrop: query(".backdrop"),
        breadcrumb: query(".breadcrumb"),
        cancelButton: query(".cancel"),
        closeButton: query(".close"),
        empty: query(".empty"),
        grid: query(".grid"),
        searchInput: query(".search"),
        selectButton: query(".select"),
        selectionTitle: query(".selection strong"),
        selectionValue: query(".selection code"),
    };
}

export function wireFilesCenterElements(
    elements: FilesCenterElements,
    callbacks: {
        close: () => void;
        confirm: () => void;
        search: () => void;
    },
): void {
    elements.closeButton.addEventListener("click", callbacks.close);
    elements.cancelButton.addEventListener("click", callbacks.close);
    elements.backdrop.addEventListener("click", (event) => {
        if (event.target === elements.backdrop) {
            callbacks.close();
        }
    });
    elements.selectButton.addEventListener("click", callbacks.confirm);
    elements.searchInput.addEventListener("input", callbacks.search);
}
