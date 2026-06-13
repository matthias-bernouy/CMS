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

export type EditorCatalogRegistration = {
    tag?: string;
    label?: string;
    description?: string;
    icon?: string;
    category?: string;
    subCategory?: string;
    bloc?: CustomElementConstructor;
    editor?: EditorConstructor;
};

export type EditorCatalogRegistrationDefaults = {
    tag: string;
    label: string;
    description?: string;
    category?: string;
    bloc?: CustomElementConstructor;
};

export type EditorCatalogRuntime = {
    readonly Editor: typeof Editor;
    registerEditor(entry: EditorCatalogRegistration): void;
    getCatalog(): EditorCatalog;
};
