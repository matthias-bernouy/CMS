import type {
    CmsSourceState,
    ContentSlot,
    EditableState,
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
    setManagedNativeEditor(editor: Editor | null): void;
};

export type EditorStructureNode = {
    kind?: "editor";
    editor: Editor;
    target: HTMLElement;
    tag: string;
    label: string;
    icon?: string;
    badges: string[];
    children: StructureNode[];
};

export type SourceStateName = CmsSourceState;
export type StructureNode = EditorStructureNode;

export type EditorRuntimeSelection = {
    editor: Editor;
    settings: SettingSection[];
    contentSlots: ContentSlot[];
    textCapability: TextCapability | null;
    states: EditableState[];
};
