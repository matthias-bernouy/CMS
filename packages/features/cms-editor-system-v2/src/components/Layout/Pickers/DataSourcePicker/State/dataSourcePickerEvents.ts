import type { EditorDataSource } from "../../../../../runtime";
import type { DataSourcePickerSourceBinding } from "../Binding/dataSourceBinding";

export type DataSourcePickerSelectDetail = {
    source: EditorDataSource;
    binding: DataSourcePickerSourceBinding;
};

export const DATA_SOURCE_PICKER_SELECT_EVENT = "editor-v2:data-source-select";
export const DATA_SOURCE_PICKER_REMOVE_EVENT = "editor-v2:data-source-remove";

export function dispatchDataSourceSelection(
    host: HTMLElement,
    source: EditorDataSource,
    binding: DataSourcePickerSourceBinding,
): void {
    host.dispatchEvent(
        new CustomEvent<DataSourcePickerSelectDetail>(DATA_SOURCE_PICKER_SELECT_EVENT, {
            bubbles: true,
            composed: true,
            detail: { source, binding },
        }),
    );
}

export function dispatchDataSourceRemoval(host: HTMLElement): void {
    host.dispatchEvent(
        new CustomEvent(DATA_SOURCE_PICKER_REMOVE_EVENT, {
            bubbles: true,
            composed: true,
        }),
    );
}

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
