import { fileDetail, fileMeta, type FileItem, type FilesCenterSelectDetail } from "./filesCenterDomain";
import type { FilesCenterElements } from "./filesCenterElements";

export type FilesCenterSelectManyDetail = {
    files: FilesCenterSelectDetail[];
};

export type FilesCenterSelection = {
    maxSelection: number | null;
    multiple: boolean;
    selected: FileItem | null;
    selectedMany: FileItem[];
};

export function renderFilesSelection(elements: FilesCenterElements, selection: FilesCenterSelection): void {
    if (selection.multiple) {
        const count = selection.selectedMany.length;
        elements.selectButton.disabled = count === 0;
        elements.selectButton.textContent = count === 1 ? "Select 1 file" : `Select ${count} files`;
        elements.selectionTitle.textContent = count === 0 ? "No files selected" : `${count} files selected`;
        elements.selectionValue.textContent = selection.maxSelection
            ? `Up to ${selection.maxSelection} files`
            : "Choose files";
        return;
    }
    elements.selectButton.disabled = !selection.selected;
    elements.selectButton.textContent = "Select file";
    elements.selectionTitle.textContent = selection.selected?.name ?? "No file selected";
    elements.selectionValue.textContent = selection.selected ? fileMeta(selection.selected) : "Choose a file";
}

export function toggleSelectedFile(item: FileItem, selection: FilesCenterSelection): FileItem | null {
    if (!selection.multiple) {
        return item;
    }
    const existingIndex = selection.selectedMany.findIndex((selected) => selected.id === item.id);
    if (existingIndex >= 0) {
        selection.selectedMany.splice(existingIndex, 1);
        return selection.selected;
    }
    if (!selection.maxSelection || selection.selectedMany.length < selection.maxSelection) {
        selection.selectedMany.push(item);
    }
    return selection.selected;
}

export function isFileSelected(item: FileItem, selection: FilesCenterSelection): boolean {
    return selection.multiple
        ? selection.selectedMany.some((selected) => selected.id === item.id)
        : selection.selected?.id === item.id;
}

export function dispatchFilesSelection(host: HTMLElement, basePath: string, selection: FilesCenterSelection): boolean {
    if (selection.multiple) {
        if (selection.selectedMany.length === 0) {
            return false;
        }
        host.dispatchEvent(
            new CustomEvent<FilesCenterSelectManyDetail>("select-files", {
                bubbles: true,
                composed: true,
                detail: { files: selection.selectedMany.map((file) => fileDetail(basePath, file)) },
            }),
        );
        return true;
    }
    if (!selection.selected) {
        return false;
    }
    host.dispatchEvent(
        new CustomEvent<FilesCenterSelectDetail>("select-file", {
            bubbles: true,
            composed: true,
            detail: fileDetail(basePath, selection.selected),
        }),
    );
    return true;
}
