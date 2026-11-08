import { parseCollectionAssetExpression } from "@bernouy/content/page-document";
import { replaceContentTextExpressions } from "@bernouy/content/rendering";
import type { ResourceDocument } from "resources/interfaces/archive";
import { ResourceArchiveError } from "resources/archive/errors";

/** Base archives are self-contained data; references never grant installation authority. */
export function validateResourceReferences(document: ResourceDocument): void {
    const ids = new Set(document.blocs.map((bloc) => bloc.id));
    const remaining = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const bloc of document.blocs) {
        const uses = bloc.uses ?? [];
        if (new Set(uses).size !== uses.length || uses.some((id) => !ids.has(id))) {
            throw new ResourceArchiveError("Bloc dependencies must be unique resources from this archive");
        }
        remaining.set(bloc.id, uses.length);
        for (const dependency of uses) {
            const next = dependents.get(dependency) ?? [];
            next.push(bloc.id);
            dependents.set(dependency, next);
        }
    }
    const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
    for (let index = 0; index < ready.length; index++) {
        for (const dependent of dependents.get(ready[index]!) ?? []) {
            const count = remaining.get(dependent)! - 1;
            remaining.set(dependent, count);
            if (count === 0) {
                ready.push(dependent);
            }
        }
    }
    if (ready.length !== ids.size) {
        throw new ResourceArchiveError("Cyclic Bloc dependencies in resource archive");
    }
    const assets = new Set(document.assets.map((asset) => `${asset.namespace}:${asset.id}`));
    const texts = new Map(
        document.texts.map((source) => [source.namespace, new Set(source.texts.map((text) => text.id))]),
    );
    const inputs = [
        ...document.blocs.flatMap((bloc) => [
            bloc.markupHTML,
            bloc.defaultContent ?? "",
            bloc.initialDocument?.html ?? "",
            bloc.styleCSS ?? "",
        ]),
        ...document.pages.map((page) => page.html),
        ...(document.theme?.sources.flatMap((source) => (source.fontFaces ?? []).map((face) => face.source)) ?? []),
    ];
    for (const input of inputs) {
        replaceContentTextExpressions(input, (namespace, id) => {
            if (!texts.get(namespace)?.has(id)) {
                throw new ResourceArchiveError("Static text is missing from the resource archive");
            }
            return "";
        });
        for (const match of input.matchAll(/\{\{([\s\S]*?)\}\}/gu)) {
            const expression = match[1]!.trim();
            if (!expression.startsWith("cms.asset.")) {
                continue;
            }
            const reference = parseCollectionAssetExpression(expression);
            if (!reference || !assets.has(`${reference.collectionId}:${reference.assetId}`)) {
                throw new ResourceArchiveError("Static asset is missing from the resource archive");
            }
        }
    }
}
