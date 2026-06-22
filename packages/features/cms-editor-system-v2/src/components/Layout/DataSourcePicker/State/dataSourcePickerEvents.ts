export function connectDataSourcePickerEvents(
    target: {
        closeButton: HTMLButtonElement;
        backdrop: HTMLElement;
        search: HTMLInputElement;
        ownerDocument: Document;
    },
    handlers: {
        close: () => void;
        backdropClick: (event: Event) => void;
        searchInput: () => void;
        keydown: (event: KeyboardEvent) => void;
    },
): () => void {
    target.closeButton.addEventListener("click", handlers.close);
    target.backdrop.addEventListener("click", handlers.backdropClick);
    target.search.addEventListener("input", handlers.searchInput);
    target.ownerDocument.addEventListener("keydown", handlers.keydown);

    return () => {
        target.closeButton.removeEventListener("click", handlers.close);
        target.backdrop.removeEventListener("click", handlers.backdropClick);
        target.search.removeEventListener("input", handlers.searchInput);
        target.ownerDocument.removeEventListener("keydown", handlers.keydown);
    };
}
