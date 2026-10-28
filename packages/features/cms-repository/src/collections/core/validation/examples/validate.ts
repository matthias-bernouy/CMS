import { collectionExampleDocument } from "./document";
import { parseHTML } from "linkedom";
import { validateExpandedPageDocument, validatePageDocument } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { CollectionLimits } from "../../limits";
import { invalid } from "../../errors";
import { collectionDocumentDefinitions } from "../../parsing/documents/definitions";
import { validateCollectionAssetReferences } from "../markup/assets";
import { validateCollectionTextReferences } from "../markup/texts";

export function validateCollectionExamples(release: CollectionRelease, limits: Readonly<CollectionLimits>): void {
    const examples = new Map((release.examples ?? []).map((example) => [example.id, example]));
    const imported =
        release.dependencies?.flatMap((dependency) => dependency.imports.blocs.map(({ id }) => ({ id }))) ?? [];
    const documents: { id: string; document: { html: string } }[] = [];
    for (const example of examples.values()) {
        const path = `$.examples[${example.id}]`;
        try {
            const materialized = collectionExampleDocument(release, example.id);
            const document = validatePageDocument(materialized.html, release.blocs, { unresolvedBlocs: imported });
            validateExpandedPageDocument(document.html, collectionDocumentDefinitions(release.blocs));
            documents.push({ id: example.id, document: materialized });
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid example", path);
        }
    }
    validateCollectionTextReferences(
        [],
        release.collectionId,
        new Set(release.texts?.map((text) => text.id)),
        new Map(
            release.dependencies?.map((dep) => [dep.collectionId, new Set(dep.imports.texts?.map(({ id }) => id))]),
        ),
        documents,
        true,
    );
    validateCollectionAssetReferences(
        [],
        release.collectionId,
        new Map(release.assets.map((asset) => [asset.id, asset])),
        new Map(
            release.dependencies?.map((dep) => [dep.collectionId, new Set(dep.imports.assets?.map(({ id }) => id))]),
        ),
        documents,
    );
    for (const bloc of release.blocs) {
        if (bloc.catalogue !== "hidden" && bloc.defaultExample === undefined) {
            invalid("listed Bloc requires a defaultExample", `$.blocs[${bloc.id}].defaultExample`);
        }
        for (const id of bloc.examples ?? []) {
            if (!examples.has(id)) {
                invalid("unknown example", `$.blocs[${bloc.id}].examples`);
            }
        }
        if (bloc.defaultExample !== undefined) {
            const example = examples.get(bloc.defaultExample);
            if (!example || !bloc.examples?.includes(bloc.defaultExample)) {
                invalid("must reference an associated example", `$.blocs[${bloc.id}].defaultExample`);
            }
            const { document } = parseHTML("<html><body></body></html>");
            document.body.innerHTML = example.document.html;
            const nodes = [...document.body.childNodes].filter(
                (node) => node.nodeType === 1 || node.textContent?.trim(),
            );
            if (nodes.length !== 1 || document.body.firstElementChild?.getAttribute("cms-bloc") !== bloc.id) {
                invalid("must contain exactly one root matching the Bloc", `$.blocs[${bloc.id}].defaultExample`);
            }
        }
    }
    if ((release.examples?.length ?? 0) > limits.maxBlocs * 4) {
        invalid("too many examples", "$.examples");
    }
}
