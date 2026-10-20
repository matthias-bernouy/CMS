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
