import { collectionExampleDocument } from "./document";
import { parseHTML } from "linkedom";
import { validateExpandedPageDocument, validatePageDocument } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { CollectionPage } from "../../../interfaces/CollectionPage";
import type { CollectionLimits } from "../../limits";
import { invalid } from "../../errors";
import { collectionPageDefinitions } from "../../parsing/pages/definitions";
import { parseCollectionTextOverrides } from "../../texts/parseCollectionTexts";
import { validateCollectionAssetReferences } from "../markup/assets";
import { validateCollectionTextReferences } from "../markup/texts";
import { record } from "../../values";

export function validateCollectionExamples(release: CollectionRelease, limits: Readonly<CollectionLimits>): void {
    const examples = new Map((release.examples ?? []).map((example) => [example.id, example]));
    const imported =
        release.dependencies?.flatMap((dependency) => dependency.imports.blocs.map(({ id }) => ({ id }))) ?? [];
    const pages: CollectionPage[] = [];
    for (const example of examples.values()) {
        const path = `$.examples[${example.id}]`;
        try {
            const dependencyTexts =
                release.dependencies?.map((dependency) => ({
                    collectionId: dependency.collectionId,
                    locale: release.locale,
                    texts: dependency.imports.texts?.map(({ id }) => ({
                        id,
                        label: id,
                        category: id,
                        group: id,
                        values: { [release.locale]: "Example" },
                    })),
                })) ?? [];
            const materialized = collectionExampleDocument(release, example.id, release.locale, dependencyTexts);
            const document = validatePageDocument(materialized.html, release.blocs, { unresolvedBlocs: imported });
            validateExpandedPageDocument(document.html, collectionPageDefinitions(release.blocs));
            pages.push({
                id: example.id,
                defaultPath: `/examples/${example.id}`,
                name: example.label,
                uses: document.uses,
                requires: [],
                document: example.document,
            });
            for (const [namespace, values] of Object.entries(example.texts)) {
                const dependency = release.dependencies?.find((item) => item.collectionId === namespace);
                if (namespace !== release.collectionId && !dependency) {
                    invalid("text namespace is not local or imported", `${path}.texts.${namespace}`);
                }
                const definitions =
                    namespace === release.collectionId
                        ? (release.texts ?? [])
                        : (dependency!.imports.texts ?? []).map(({ id }) => ({
                              id,
                              label: id,
                              category: id,
                              group: id,
                              values: {},
                          }));
                parseCollectionTextOverrides(record(values, `${path}.texts.${namespace}`), definitions);
            }
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
        pages,
        true,
    );
    validateCollectionAssetReferences(
        [],
        release.collectionId,
        new Map(release.assets.map((asset) => [asset.id, asset])),
        new Map(
            release.dependencies?.map((dep) => [dep.collectionId, new Set(dep.imports.assets?.map(({ id }) => id))]),
        ),
        pages,
    );
    for (const bloc of release.blocs) {
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
