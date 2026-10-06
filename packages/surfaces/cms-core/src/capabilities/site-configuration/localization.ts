import { readSystemSnapshot } from "@bernouy/cms-content";
import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "../../dispatch/registry";
import type { CmsLocalizationDependencies } from "../../ports";
import { projectTextCatalogue } from "./projection";
import {
    configurationCommand,
    language,
    languages,
    optionalText,
    parseConfigurationJson,
    requiredText,
    revision,
} from "./support";

export function registerLocalizationCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsLocalizationDependencies,
): void {
    dispatcher.register("ulvia.cms.localization", "overview", async (_input, context) => {
        const [snapshot, collections] = await Promise.all([
            readSystemSnapshot(core.repo),
            core.collections.snapshot(context.siteId),
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
            const system = await core.repo.updateSystem(
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
        const snapshot = await core.collections.snapshot(context.siteId);
        const installation = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId);
        if (!installation) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectTextCatalogue(snapshot.revision, installation, optionalText(input.locale));
    });
    dispatcher.register("ulvia.cms.localization", "save-texts", async (input, context) =>
        configurationCommand(async () => {
            const snapshot = await core.collections.saveTexts(
                context.siteId,
                requiredText(input.collectionId),
                revision(input.expectedRevision),
                parseConfigurationJson(input.overridesJson),
            );
            const installation = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId)!;
            return projectTextCatalogue(snapshot.revision, installation, optionalText(input.locale));
        }),
    );
}
