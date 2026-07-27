import type { SiteBlocDefinition, SiteBlocSlot } from "@bernouy/cms-content";
import { Editor, type EditorCatalogEntry } from "@bernouy/cms-content/editor";
import { siteSlotPlaceholderCatalogEntry } from "cms-control/core/editorSystemV2/builtInEditors";
import type { BlocCatalogueItem } from "./siteBlocApi";

type EditorInsertableCatalogEntry = EditorCatalogEntry & { insertable?: boolean };

export type SiteBlocCatalogs = {
    structure: EditorInsertableCatalogEntry[];
    defaults: EditorInsertableCatalogEntry[];
    structureTags: Set<string>;
};

export function createSiteBlocCatalogs(
    baseCatalog: EditorInsertableCatalogEntry[],
    catalogue: BlocCatalogueItem[],
    definition: SiteBlocDefinition,
): SiteBlocCatalogs {
    const structureTags = eligibleStructureTags(catalogue, definition.tag);
    const structure = baseCatalog.filter((entry) => structureTags.has(entry.tag.toLowerCase())).map(structureEntry);
    structure.push(siteSlotPlaceholderCatalogEntry());

    const defaults = baseCatalog.filter((entry) => entry.tag.toLowerCase() !== definition.tag);
    defaults.push(siteBlocHostCatalogEntry(definition));
    return { structure, defaults, structureTags };
}

function structureEntry(entry: EditorInsertableCatalogEntry): EditorInsertableCatalogEntry {
    return { ...entry, defaultContent: undefined };
}

export function eligibleStructureTags(catalogue: BlocCatalogueItem[], ownerTag: string): Set<string> {
    const normalizedOwner = ownerTag.toLowerCase();
    return new Set(
        catalogue
            .filter((item) => item.tag.toLowerCase() !== normalizedOwner)
            .filter((item) => item.state !== "archived")
            .filter((item) => item.origin.kind !== "site-builder" || item.publishedRevision !== null)
            .filter(
                (item) => !item.publishedTransitiveDependencies.some((tag) => tag.toLowerCase() === normalizedOwner),
            )
            .map((item) => item.tag.toLowerCase()),
    );
}

function siteBlocHostCatalogEntry(definition: SiteBlocDefinition): EditorInsertableCatalogEntry {
    const slots = cloneSlots(definition.draft.slots);
    class SiteBlocHostEditor extends Editor {
        protected override contentSlots(): SiteBlocSlot[] {
            return cloneSlots(slots);
        }
    }

    return {
        tag: definition.tag,
        label: definition.draft.name,
        description: "Current site bloc instance",
        category: "Site builder",
        bloc: HTMLElement,
        editor: SiteBlocHostEditor,
        insertable: false,
    } satisfies EditorInsertableCatalogEntry;
}

function cloneSlots(slots: SiteBlocSlot[]): SiteBlocSlot[] {
    return slots.map((slot) => ({
        ...slot,
        accepts: slot.accepts.map((accept) => ({
            ...accept,
            ...(accept.kind === "media" && accept.accept ? { accept: [...accept.accept] } : {}),
        })),
    }));
}

export function isTagInsertable(tags: ReadonlySet<string>, tag: string, _entry: EditorCatalogEntry): boolean {
    return tags.has(tag.toLowerCase());
}
