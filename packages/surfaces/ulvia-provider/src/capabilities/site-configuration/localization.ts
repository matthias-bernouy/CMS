import { readSystemSnapshot } from "@bernouy/cms-content";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsLocalizationDependencies } from "../../ports";
import { projectTextCatalogue } from "./projection";
import { configurationCommand, language, languages, optionalText, requiredText, revision } from "./support";

export function registerLocalizationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsLocalizationDependencies,
): void {
    dispatcher.register("ulvia.cms.localization", "overview", async (_input, context) => {
        const [snapshot, collections] = await Promise.all([
            readSystemSnapshot(dependencies.repo),
            dependencies.collections.snapshot(context.siteId),
        ]);
        const selectedLanguage =
            snapshot.system.site.language.trim() || collections.collections[0]?.release.locale || "en";
        return {
            revision: snapshot.revision,
            language: selectedLanguage,
            additionalLanguages: snapshot.system.site.additionalLanguages ?? [],
            activeLanguages: snapshot.system.site.activeLanguages ?? [],
        };
    });
    dispatcher.register("ulvia.cms.localization", "update-languages", async (input) =>
        configurationCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const system = await dependencies.repo.updateSystem(
                {
                    site: {
                        language: language(input.language),
                        additionalLanguages: languages(input.additionalLanguages),
                        activeLanguages: languages(input.activeLanguages),
                    },
                } as never,
                expectedRevision,
            );
            return {
                revision: expectedRevision + 1,
                language: system.site.language,
                additionalLanguages: system.site.additionalLanguages ?? [],
                activeLanguages: system.site.activeLanguages ?? [],
            };
        }),
    );
    dispatcher.register("ulvia.cms.localization", "get-texts", async (input, context) => {
        const [snapshot, system] = await Promise.all([
            dependencies.collections.snapshot(context.siteId),
            readSystemSnapshot(dependencies.repo),
        ]);
        const installation = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId);
        if (!installation) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectTextCatalogue(snapshot.revision, installation, {
            locale: optionalText(input.locale),
            group: optionalText(input.group),
            search: optionalText(input.search),
            siteLocales: [
                system.system.site.language,
                ...(system.system.site.additionalLanguages ?? []),
                ...(system.system.site.activeLanguages ?? []),
            ],
        });
    });
    dispatcher.register("ulvia.cms.localization", "save-text", async (input, context) =>
        configurationCommand(async () => {
            const collectionId = requiredText(input.collectionId);
            const expectedRevision = revision(input.expectedRevision);
            const locale = language(input.locale);
            const textId = requiredText(input.textId);
            const value = textValue(input.value);
            const current = await dependencies.collections.snapshot(context.siteId);
            const installation = current.collections.find((item) => item.collectionId === collectionId);
            if (!installation || !installation.release.texts?.some((text) => text.id === textId)) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
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
                context.siteId,
                collectionId,
                expectedRevision,
                overrides,
            );
            return {
                revision: snapshot.revision,
                collectionId,
                textId,
                locale,
                overridden: Boolean(value),
            };
        }),
    );
}

function textValue(value: unknown): string {
    if (typeof value !== "string" || value.length > 65_536) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
