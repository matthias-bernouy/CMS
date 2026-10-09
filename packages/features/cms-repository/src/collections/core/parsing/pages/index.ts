import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionPage, CollectionPageSurface } from "../../../interfaces/CollectionPage";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, integer, keys, record, string, unique } from "../../values";
import { parseRequirements } from "../requirements";
import { parseDefaultPath, parseSurface, validatePageHtml } from "./document";
import { markupTree } from "../../validation/markup/tree";
import { validatePageDocumentSlotContracts } from "../../validation/markup/slotContracts";
import { validatePageBlocHosts } from "../../validation/pageDocument/hosts";
import { validateManagedNativeHosts } from "../../validation/markup/managedNative";
import { validatePageContentMarkup } from "@bernouy/cms-content/page-document";

/** Parses a bounded Page document for exactly one rendering surface. */
export function parseCollectionPages(
    value: unknown,
    blocSurfaces: ReadonlyMap<string, readonly CollectionPageSurface[]>,
    limits: Readonly<CollectionLimits>,
    localBlocs: readonly CollectionBloc[] = [],
): readonly CollectionPage[] {
    const localById = new Map(localBlocs.map((bloc) => [bloc.id, bloc]));
    const importedBlocs = new Set([...blocSurfaces.keys()].filter((id) => !localById.has(id)));
    const pages = array(value, limits.maxPages, "$.pages").map((entry, index) => {
        const path = `$.pages[${index}]`;
        const source = record(entry, path);
        keys(
            source,
            [
                "id",
                "generation",
                "surface",
                "defaultPath",
                "name",
                "icon",
                "description",
                "requires",
                "uses",
                "document",
            ],
            path,
        );
        const id = identifier(source.id, `${path}.id`);
        const surface = parseSurface(source.surface, `${path}.surface`);
        const defaultPath = parseDefaultPath(source.defaultPath, surface, `${path}.defaultPath`);
        const document = record(source.document, `${path}.document`);
        keys(document, ["html"], `${path}.document`);
        const authoredHtml = string(document.html, limits.maxMarkupLength, `${path}.document.html`);
        let html = authoredHtml;
        const structure = validatePageHtml(html, new Set(blocSurfaces.keys()), surface, `${path}.document.html`);
        const tree = markupTree(html);
        validatePageDocumentSlotContracts(tree, localById, importedBlocs, `${path}.document.html`);
        validatePageBlocHosts(tree, localById, importedBlocs, `${path}.document.html`);
        validateManagedNativeHosts(tree, localById, `${path}.document.html`);
        try {
            html = validatePageContentMarkup(authoredHtml);
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid Page document", `${path}.document.html`);
        }
        const uses = [...structure.blocs].sort();
        if (source.uses !== undefined) {
            const declared = array(source.uses, limits.maxBlocs, `${path}.uses`).map((item, itemIndex) =>
                string(item, 128, `${path}.uses[${itemIndex}]`),
            );
            unique(declared, `${path}.uses`);
            if (declared.sort().join("\0") !== uses.join("\0")) {
                invalid("must exactly match the Blocs referenced by Page HTML", `${path}.uses`);
            }
        }
        for (const blocId of uses) {
            if (!blocSurfaces.get(blocId)?.includes(surface)) {
                invalid(`references Bloc ${blocId} outside the ${surface} surface`, `${path}.document.html`);
            }
        }
        const requires = parseRequirements(source.requires, `${path}.requires`, limits);
        const declaredCalls = new Set(requires.map((item) => `${item.contractId}/${item.capabilityId}`));
        if (
            declaredCalls.size !== structure.calls.size ||
            [...structure.calls].some((call) => !declaredCalls.has(call))
        ) {
            invalid("must exactly match the capabilities called by Page HTML", `${path}.requires`);
        }
        return {
            id,
            generation:
                source.generation === undefined
                    ? 1
                    : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
            surface,
            defaultPath,
            name: string(source.name, 128, `${path}.name`),
            ...(source.icon === undefined ? {} : { icon: identifier(source.icon, `${path}.icon`) }),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, `${path}.description`) }),
            uses,
            requires,
            document: { html },
        };
    });
    unique(
        pages.map((page) => page.id),
        "$.pages",
    );
    unique(
        pages.map((page) => `${page.surface}:${page.defaultPath}`),
        "$.pages",
    );
    return pages.sort((left, right) => left.id.localeCompare(right.id));
}

/** Validates the complete local Bloc closure; imported Blocs are checked when collections are installed together. */
export function validateLocalPageSurfaces(pages: readonly CollectionPage[], blocs: readonly CollectionBloc[]): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    for (const [index, page] of pages.entries()) {
        const seen = new Set<string>();
        const pending = [...page.uses];
        while (pending.length > 0) {
            const id = pending.pop()!;
            if (seen.has(id)) {
                continue;
            }
            seen.add(id);
            const bloc = byId.get(id);
            if (!bloc) {
                continue;
            }
            if (!bloc.surfaces.includes(page.surface)) {
                invalid(`references Bloc ${id} outside the ${page.surface} surface`, `$.pages[${index}].document.html`);
            }
            pending.push(...bloc.uses);
        }
    }
}
