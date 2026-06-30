export function connectDataSourcePickerEvents(
    target: {
        closeButton: HTMLButtonElement;
        backdrop: HTMLElement;
        search: HTMLInputElement;
        methodFilter: HTMLSelectElement;
        ownerDocument: Document;
    },
    handlers: {
        close: () => void;
        backdropClick: (event: Event) => void;
        searchInput: () => void;
        methodChange: () => void;
        keydown: (event: KeyboardEvent) => void;
    },
): () => void {
    target.closeButton.addEventListener("click", handlers.close);
    target.backdrop.addEventListener("click", handlers.backdropClick);
    target.search.addEventListener("input", handlers.searchInput);
    target.methodFilter.addEventListener("change", handlers.methodChange);
    target.ownerDocument.addEventListener("keydown", handlers.keydown);

    return () => {
        target.closeButton.removeEventListener("click", handlers.close);
        target.backdrop.removeEventListener("click", handlers.backdropClick);
        target.search.removeEventListener("input", handlers.searchInput);
        target.methodFilter.removeEventListener("change", handlers.methodChange);
        target.ownerDocument.removeEventListener("keydown", handlers.keydown);
    };
}
