import type { Editor } from "./Editor";

export type EditorConstructor = new (target: HTMLElement) => Editor;

export type EditorCatalogPlacement =
    | { kind: "anywhere" }
    | { kind: "explicit-slot" }
    | { kind: "parent-tags"; tags: readonly string[] };

export type EditorCatalogEntry = {
    tag: string;
    label: string;
    description?: string;
    icon?: string;
    category?: string;
    subCategory?: string;
    defaultContent?: string;
    placement?: EditorCatalogPlacement;
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
    defaultContent?: string;
    placement?: EditorCatalogPlacement;
    bloc?: CustomElementConstructor;
    editor?: EditorConstructor;
};

export type EditorCatalogRegistrationDefaults = {
    tag: string;
    label: string;
    description?: string;
    category?: string;
    defaultContent?: string;
    placement?: EditorCatalogPlacement;
    bloc?: CustomElementConstructor;
};

export type EditorCatalogRuntime = {
    readonly Editor: typeof Editor;
    registerEditor(entry: EditorCatalogRegistration): void;
    getCatalog(): EditorCatalog;
};
