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

export type EditorNativeAttribute = { required?: boolean; values?: string[] };
export type EditorNativeElement = {
    accepts?: string[];
    attributes?: Record<string, EditorNativeAttribute>;
    defaults?: Record<string, string>;
};
export type EditorSlot = { accepts?: EditorSlotAccept[]; min?: number; max?: number };
export type EditorSlotAccept = EditorNativeElement & {
    kind?: string;
    tag?: string;
    profile?: "phrasing" | "inline" | "prose";
};

export function normalizedSlotName(name: string): string {
    return name === "default" ? "" : name;
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
