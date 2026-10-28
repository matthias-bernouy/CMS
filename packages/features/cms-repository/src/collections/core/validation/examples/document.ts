import { parseHTML } from "linkedom";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { PageDocument } from "@bernouy/cms-content/page-document";

/** Apply ordinary Bloc insertion defaults without resolving shared collection text references. */
export function collectionExampleDocument(
    release: CollectionRelease,
    exampleId: string,
    dependencies: readonly Pick<CollectionRelease, "blocs">[] = [],
): PageDocument {
    const example = release.examples?.find((item) => item.id === exampleId);
    if (!example) {
        throw new TypeError(`Unknown collection example: ${exampleId}`);
    }
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = example.document.html;
    const blocById = new Map(
        [release, ...dependencies].flatMap((collection) => collection.blocs.map((bloc) => [bloc.id, bloc] as const)),
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
    return { html: document.body.innerHTML };
}
