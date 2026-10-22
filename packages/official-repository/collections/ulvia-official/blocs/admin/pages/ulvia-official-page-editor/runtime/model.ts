export type EditorCatalogueItem = {
    id: string;
    name: string;
    group: string;
    description: string;
    kind: "component" | "composition";
    ownership: "code-managed" | "site-builder";
    order: number;
    defaultContent: string;
    authoringJson: string;
};

export type EditorCatalogue = {
    items: EditorCatalogueItem[];
};

export type PageUpdate = {
    id: string;
    revision: number;
    path: string;
    title: string;
    content: string;
    routes: Array<{ language: string; path: string; primary: boolean }>;
};

/**
 * The MVP editor deliberately understands only static Bloc composition.
 * Declarative queries, mutations and state transports remain valid Page markup,
 * but are not authoring concepts exposed by this model.
 */
export type AuthoringContract = {
    settings?: EditorSetting[];
    root?: EditorNativeElement;
    slots?: Record<string, EditorSlot>;
};

type EditorNativeElement = { accepts?: string[]; defaults?: Record<string, string> };
type EditorSlot = { accepts?: EditorSlotAccept[] };
type EditorSlotAccept = EditorNativeElement & { kind?: string };

export type ManagedContent = {
    readonly slot: string;
    readonly nativeElement?: EditorNativeElement;
};

export function managedContent(contract: AuthoringContract): ManagedContent | undefined {
    const entries = Object.entries(contract.slots ?? {});
    if (entries.length !== 1) {
        return undefined;
    }
    const [slot, definition] = entries[0]!;
    const nativeElement = definition.accepts?.find((accept) => accept.kind === "native-element");
    if (nativeElement) {
        return { slot, nativeElement };
    }
    return definition.accepts?.some((accept) => accept.kind === "native-content") ? { slot } : undefined;
}

export type EditorSetting = {
    id: string;
    label: string;
    group?: string;
    help?: string;
    visibleWhen?: EditorSettingVisibilityRule[];
    type: "boolean" | "integer" | "number" | "string";
    default: boolean | number | string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    control: EditorSettingControl;
};

type EditorSettingOption = { value: string; label: string; icon?: string };

type EditorSettingControl =
    | { kind: "text"; placeholder?: string }
    | { kind: "select" | "segmented"; options: EditorSettingOption[] }
    | { kind: "color"; tokens?: EditorSettingOption[]; allowCustom?: boolean }
    | { kind: "media-picker"; accept?: string[] }
    | { kind: "theme-token-picker"; accept?: string[] }
    | { kind: "number" | "range"; step?: number; suffix?: string }
    | { kind: "toggle" };

type EditorSettingVisibilityRule = {
    setting: string;
    equals?: Array<string | boolean> | string | boolean;
    notEquals?: Array<string | boolean> | string | boolean;
};

export function authoringContract(item: EditorCatalogueItem): AuthoringContract {
    try {
        return JSON.parse(item.authoringJson) as AuthoringContract;
    } catch {
        return {};
    }
}

export function displayLabel(value: string): string {
    return value
        .replace(/^ulvia-official-/, "")
        .replaceAll("-", " ")
        .replace(/^./, (character) => character.toUpperCase());
}
