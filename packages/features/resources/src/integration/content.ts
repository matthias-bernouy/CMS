import type { ContentRepository } from "@bernouy/content";
import type { ResourceTexts } from "resources/storage/texts";
import { resourceTextSource } from "resources/storage/texts";

/** Ordinary persisted texts supply the existing Content read port; no archive is retained by the view. */
export function withResourceTexts(repository: ContentRepository, texts: ResourceTexts): ContentRepository {
    return new Proxy(repository, {
        get(target, key) {
            if (key === "getTextContributions") {
                return async (reads?: Parameters<NonNullable<ContentRepository["getTextContributions"]>>[0]) => {
                    const load = () => texts.snapshot();
                    const snapshot = reads ? await reads.resource(texts, "resource-texts", load) : await load();
                    return { revision: snapshot.revision, texts: snapshot.sources.map(resourceTextSource) };
                };
            }
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
