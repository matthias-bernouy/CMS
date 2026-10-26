import { parseHTML } from "linkedom";
import { renderContentTexts } from "@bernouy/cms-content/rendering";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { PageDocument } from "@bernouy/cms-content/page-document";
import { resolveCollectionTexts } from "../../texts/resolveCollectionTexts";

/** Materialize editable example copy without persisting demonstration overrides on a site. */
export function collectionExampleDocument(
    release: CollectionRelease,
    exampleId: string,
    locale = release.locale,
    dependencies: readonly Pick<CollectionRelease, "collectionId" | "locale" | "texts">[] = [],
): PageDocument {
    const example = release.examples?.find((item) => item.id === exampleId);
    if (!example) {
        throw new TypeError(`Unknown collection example: ${exampleId}`);
    }
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = example.document.html;
    const blocById = new Map(
        [release, ...dependencies].flatMap((collection) =>
            "blocs" in collection
                ? (collection as CollectionRelease).blocs.map((bloc) => [bloc.id, bloc] as const)
                : [],
        ),
    );
    for (const node of Array.from(document.body.querySelectorAll("[cms-bloc]"))) {
        const bloc = blocById.get(node.getAttribute("cms-bloc")!);
        if (!bloc) {
            continue;
        }
        for (const [name, value] of Object.entries(bloc.root.defaults ?? {})) {
            if (!node.hasAttribute(name) && node.localName === bloc.root.accepts[0]) {
                node.setAttribute(name, value);
            }
        }
        for (const setting of bloc.kind === "component" ? (bloc.settings ?? []) : []) {
            if (!node.hasAttribute(setting.id) && setting.default !== false) {
                node.setAttribute(setting.id, setting.default === true ? "" : String(setting.default));
            }
        }
    }
    const allowed = new Set(release.dependencies?.map((dependency) => dependency.collectionId));
    const releases = [
        release,
        ...dependencies.filter((item) => item.collectionId !== release.collectionId && allowed.has(item.collectionId)),
    ];
    const referenced = new Map<string, Set<string>>();
    for (const match of document.body.innerHTML.matchAll(
        /\{\{\s*cms\.i18n\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\s*\}\}/g,
    )) {
        const ids = referenced.get(match[1]!) ?? new Set<string>();
        ids.add(match[2]!);
        referenced.set(match[1]!, ids);
    }
    renderContentTexts(
        document.body,
        locale,
        releases.map((collection) => ({
            namespace: collection.collectionId,
            resolve: (language) =>
                Object.fromEntries(
                    Object.entries(
                        resolveCollectionTexts(
                            {
                                ...collection,
                                texts: collection.texts?.filter((text) =>
                                    referenced.get(collection.collectionId)?.has(text.id),
                                ),
                            },
                            language,
                            Object.fromEntries(
                                Object.entries(example.texts[collection.collectionId] ?? {}).filter(([id]) =>
                                    referenced.get(collection.collectionId)?.has(id),
                                ),
                            ),
                        ),
                    ).map(([id, text]) => [id, text.value]),
                ),
        })),
    );
    return { html: document.body.innerHTML };
}
