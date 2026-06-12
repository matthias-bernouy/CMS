import type {
    Editor,
    EditorCatalogEntry,
    SettingSection,
} from "@bernouy/cms-content/editor";

export type RuntimeManagedEditor = Editor & {
    readonly catalogEntry: EditorCatalogEntry;
    mount(): void;
    unmount(): void;
    dispose(): void;
};

export type EditorStructureNode = {
    editor: Editor;
    target: HTMLElement;
    tag: string;
    label: string;
    icon?: string;
    children: EditorStructureNode[];
};

export type EditorRuntimeSelection = {
    editor: Editor;
    settings: SettingSection[];
};
