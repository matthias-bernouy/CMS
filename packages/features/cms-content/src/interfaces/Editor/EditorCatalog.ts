import type { Editor } from "./Editor";

export type EditorConstructor = new (target: HTMLElement) => Editor;

export type EditorCatalogEntry = {
    tag: string;
    label: string;
    description?: string;
    icon?: string;
    category?: string;
    subCategory?: string;
    bloc: CustomElementConstructor;
    editor: EditorConstructor;
};

export type EditorCatalog = EditorCatalogEntry[];
