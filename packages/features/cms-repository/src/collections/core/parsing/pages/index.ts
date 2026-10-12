import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionPage } from "../../../interfaces/CollectionPage";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, integer, keys, record, string, unique } from "../../values";
import { capabilityCallKey, parseRequirements } from "../requirements";
import { parseDefaultPath } from "./document";
import { validatePageDocument, type PageDocumentValidationResult } from "@bernouy/cms-content/page-document";

/** Parses a bounded immutable Page document. */
export function parseCollectionPages(
    value: unknown,
    availableBlocIds: ReadonlySet<string>,
    limits: Readonly<CollectionLimits>,
    localBlocs: readonly CollectionBloc[] = [],
): readonly CollectionPage[] {
    const localById = new Map(localBlocs.map((bloc) => [bloc.id, bloc]));
    const importedBlocs = new Set([...availableBlocIds].filter((id) => !localById.has(id)));
    const pages = array(value, limits.maxPages, "$.pages").map((entry, index) => {
        const path = `$.pages[${index}]`;
        const source = record(entry, path);
        keys(
            source,
            ["id", "generation", "defaultPath", "name", "icon", "description", "requires", "uses", "document"],
            path,
        );
        const id = identifier(source.id, `${path}.id`);
        const defaultPath = parseDefaultPath(source.defaultPath, `${path}.defaultPath`);
        const document = record(source.document, `${path}.document`);
        keys(document, ["html"], `${path}.document`);
        const authoredHtml = string(document.html, limits.maxMarkupLength, `${path}.document.html`);
        let validated: PageDocumentValidationResult;
        try {
            validated = validatePageDocument(authoredHtml, localBlocs, {
                unresolvedBlocs: [...importedBlocs].map((id) => ({ id })),
            });
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid Page document", `${path}.document.html`);
        }
        const { html, sources, uses } = validated!;
        if (source.uses !== undefined) {
            const declared = array(source.uses, limits.maxBlocs, `${path}.uses`).map((item, itemIndex) =>
                string(item, 128, `${path}.uses[${itemIndex}]`),
            );
            unique(declared, `${path}.uses`);
            if (declared.sort().join("\0") !== uses.join("\0")) {
                invalid("must exactly match the Blocs referenced by Page HTML", `${path}.uses`);
            }
        }
        const requires = parseRequirements(source.requires, `${path}.requires`, limits);
        const calls = new Set(
            sources.map(({ method, url }) => {
                const call = capabilityCallKey(url);
                if (!call || method !== "POST") {
                    return invalid(
                        "Page sources must use a canonical CMS capability with POST",
                        `${path}.document.html`,
                    );
                }
                return call;
            }),
        );
        const declaredCalls = new Set(requires.map((item) => `${item.contractId}/${item.capabilityId}`));
        if (declaredCalls.size !== calls.size || [...calls].some((call) => !declaredCalls.has(call))) {
            invalid("must exactly match the capabilities called by Page HTML", `${path}.requires`);
        }
        return {
            id,
            generation:
                source.generation === undefined
                    ? 1
                    : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
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
        pages.map((page) => page.defaultPath),
        "$.pages",
    );
    return pages.sort((left, right) => left.id.localeCompare(right.id));
}

/** Validates the complete local Bloc closure; imported Blocs are checked when collections are installed together. */
