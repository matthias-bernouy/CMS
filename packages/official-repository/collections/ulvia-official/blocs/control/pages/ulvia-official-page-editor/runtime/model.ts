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

export type EditorCatalogue = { items: EditorCatalogueItem[] };

export type PageUpdate = {
    id: string;
    revision: number;
    surface: "control" | "delivery";
    path: string;
    title: string;
    description: string;
    content: string;
    tags: string[];
    visible: boolean;
};

export type AuthoringContract = {
    settings?: EditorSetting[];
    nativeElement?: { accepts?: string[] };
};

export type EditorSetting = {
    id: string;
    type: "boolean" | "integer" | "number" | "string";
    default?: boolean | number | string;
    control?: { kind?: string; options?: Array<{ value: string }> };
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
