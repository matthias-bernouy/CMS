import { collectionExampleDocument, resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsContentDependencies } from "../../../ports";

export async function listExamples(
    dependencies: CmsContentDependencies,
    input: { collectionId: string; locale: string; offset?: number; cursor?: string; limit?: number },
) {
    const locale = exampleLocale(input.locale);
    if (!locale) {
        throw new TypeError("An example locale is required");
    }
    if (input.cursor !== undefined && (input.offset !== undefined || !/^(0|[1-9]\d{0,8})$/.test(input.cursor))) {
        throw new TypeError("Invalid example cursor");
    }
    const offset = input.offset ?? Number(input.cursor ?? 0);
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError("Invalid example pagination");
    }
    const snapshot = await dependencies.collections.snapshot("default");
    const installed = snapshot.collections.find((item) => item.collectionId === input.collectionId);
    if (!installed) {
        throw new TypeError("The example collection is not installed");
    }
    const examples = installed.release.examples ?? [];
    return {
        locale,
        nextCursor: offset + limit < examples.length ? String(offset + limit) : "",
        revision: snapshot.revision,
        collectionId: installed.collectionId,
        items: examples.slice(offset, offset + limit).map((example) => ({
            id: example.id,
            label: resolveCollectionTranslation(installed.release, example.label, locale),
            description: resolveCollectionTranslation(installed.release, example.description, locale),
            previews: example.previews,
        })),
        total: examples.length,
        offset,
        limit,
    };
}

/** Read a generic example document; callers can edit it or submit its HTML through ordinary Content writes. */
export async function getExample(
    dependencies: CmsContentDependencies,
    input: { collectionId: string; exampleId: string },
) {
    const snapshot = await dependencies.collections.snapshot("default");
    const installed = snapshot.collections.find((item) => item.collectionId === input.collectionId);
    if (!installed) {
        throw new TypeError("The example collection is not installed");
    }
    const document = collectionExampleDocument(
        installed.release,
        input.exampleId,
        snapshot.collections.map((item) => item.release),
    );
    return { collectionId: installed.collectionId, id: input.exampleId, document };
}

function exampleLocale(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
        throw new TypeError("An example locale is required");
    }
    try {
        const locale = Intl.getCanonicalLocales(value)[0];
        if (locale) {
            return locale;
        }
    } catch {
        throw new TypeError("Invalid example locale");
    }
    throw new TypeError("Invalid example locale");
}
