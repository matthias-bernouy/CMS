import { composeCollectionThemes, readSystemSnapshot, type ThemeSettings } from "@bernouy/cms-content";
import type { CoreCapabilityRegistry } from "../../dispatch/registry";
import type { CmsThemeDependencies } from "../../ports";
import { configurationCommand, parseConfigurationJson, revision } from "./support";

export function registerThemeCapabilities(dispatcher: CoreCapabilityRegistry, core: CmsThemeDependencies): void {
    dispatcher.register("ulvia.cms.theme", "get", async (_input, context) => {
        const [snapshot, collections] = await Promise.all([
            readSystemSnapshot(core.repo),
            core.collections.snapshot(context.siteId),
        ]);
        const theme = composeCollectionThemes(
            snapshot.system.theme,
            collections.collections.map(({ release }) => release),
            snapshot.system.site.language,
        );
        return {
            revision: snapshot.revision,
            activeThemeId: theme.activeThemeId,
            themeJson: JSON.stringify(theme),
        };
    });
    dispatcher.register("ulvia.cms.theme", "save", async (input, context) =>
        configurationCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const [snapshot, collections] = await Promise.all([
                readSystemSnapshot(core.repo),
                core.collections.snapshot(context.siteId),
            ]);
            const theme = composeCollectionThemes(
                parseConfigurationJson(input.themeJson) as ThemeSettings,
                collections.collections.map(({ release }) => release),
                snapshot.system.site.language,
            );
            const system = await core.repo.updateSystem({ theme }, expectedRevision);
            return {
                revision: expectedRevision + 1,
                activeThemeId: system.theme.activeThemeId,
                themeJson: JSON.stringify(system.theme),
            };
        }),
    );
}
