import { composeCollectionThemes } from "@bernouy/cms-repository/collections/content";
import { ContentCapabilityError } from "@bernouy/cms-content/feature";
import type { ContentContributions } from "@bernouy/cms-content/feature";
import type { CmsContentDependencies } from "../../../../ports/index";
import { listExamples, getExample } from "./examples";
import { projectTextCatalogue } from "./texts";
/** Collection-owned adapters remain host supplied until the resource distribution transition. */
export function createContentContributions(dependencies: CmsContentDependencies): ContentContributions {
    return {
        snapshot: async (siteId) => {
            const snapshot = await dependencies.collections.snapshot(siteId);
            return {
                revision: snapshot.revision,
                fallbackLocale: snapshot.collections[0]?.release.locale,
                theme: (base, locale) =>
                    composeCollectionThemes(
                        base,
                        snapshot.collections.map(({ release }) => release),
                        locale,
                    ),
                texts: (id, selection) => {
                    const installation = snapshot.collections.find(({ collectionId }) => collectionId === id);
                    if (!installation) {
                        throw new ContentCapabilityError("NOT_FOUND");
                    }
                    return projectTextCatalogue(snapshot.revision, installation, selection);
                },
            };
        },
        listExamples: (input) => listExamples(dependencies, input),
        getExample: (input) => getExample(dependencies, input),
        saveText: async (siteId, input) => {
            const { collectionId, expectedRevision, locale, textId, value } = input;
            const current = await dependencies.collections.snapshot(siteId);
            const installation = current.collections.find((item) => item.collectionId === collectionId);
            if (!installation || !installation.release.texts?.some((text) => text.id === textId)) {
                throw new ContentCapabilityError("NOT_FOUND");
            }
            const overrides: Record<string, Record<string, string>> = Object.fromEntries(
                Object.entries(installation.textOverrides).map(([id, localized]) => [id, { ...localized }]),
            );
            const localized = { ...(overrides[textId] ?? {}) };
            if (value) {
                localized[locale] = value;
            } else {
                delete localized[locale];
            }
            if (Object.keys(localized).length) {
                overrides[textId] = localized;
            } else {
                delete overrides[textId];
            }
            const snapshot = await dependencies.collections.saveTexts(
                siteId,
                collectionId,
                expectedRevision,
                overrides,
            );
            return { revision: snapshot.revision, collectionId, textId, locale, overridden: Boolean(value) };
        },
    };
}
