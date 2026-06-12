import type {
    ContentSlot,
    Editor,
    EditorCatalogEntry,
    SettingSection,
    TextCapability,
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
    badges: string[];
    children: EditorStructureNode[];
};

export type EditorRuntimeSelection = {
    editor: Editor;
    settings: SettingSection[];
    contentSlots: ContentSlot[];
    textCapability: TextCapability | null;
};
