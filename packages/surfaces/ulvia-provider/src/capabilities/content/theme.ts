import { readSystemSnapshot, type ThemeMode } from "@bernouy/cms-content";
import { composeCollectionThemes } from "@bernouy/cms-repository/collections/content";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsContentDependencies } from "../../ports";
import { configurationCommand, optionalText, requiredText, revision } from "./support";
import { projectThemeWorkspace } from "./themeProjection";

export function registerThemeCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    dispatcher.register("ulvia.cms.content", "theme.get", async (input, context) => {
        const { revision, theme } = await readTheme(dependencies, context.siteId);
        return projectThemeWorkspace(theme, revision, {
            collectionId: optionalText(input.collectionId),
            profileId: optionalText(input.profileId),
            mode: optionalText(input.mode),
            tokenId: optionalText(input.tokenId),
            search: optionalText(input.search),
        });
    });
    dispatcher.register("ulvia.cms.content", "theme.activate", async (input, context) =>
        configurationCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const { theme } = await readTheme(dependencies, context.siteId);
            const themeId = requiredText(input.themeId);
            if (!theme.themes.some(({ id }) => id === themeId)) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            theme.activeThemeId = themeId;
            const system = await dependencies.repo.updateSystem({ theme }, expectedRevision);
            return {
                revision: expectedRevision + 1,
                activeThemeId: system.theme.activeThemeId,
            };
        }),
    );
    dispatcher.register("ulvia.cms.content", "theme.token.save", async (input, context) =>
        mutateToken(dependencies, context.siteId, input, false),
    );
    dispatcher.register("ulvia.cms.content", "theme.token.reset", async (input, context) =>
        mutateToken(dependencies, context.siteId, input, true),
    );
}

async function mutateToken(
    dependencies: CmsContentDependencies,
    siteId: string,
    input: Record<string, unknown>,
    reset: boolean,
) {
    return configurationCommand(async () => {
        const expectedRevision = revision(input.expectedRevision);
        const themeId = requiredText(input.themeId);
        const tokenId = requiredText(input.tokenId);
        const mode = themeMode(input.mode);
        const { theme } = await readTheme(dependencies, siteId);
        const profile = theme.themes.find(({ id }) => id === themeId);
        const tokenExists = theme.sources.some((source) =>
            source.categories.some((category) => category.tokens.some(({ id }) => id === tokenId)),
        );
        if (!profile || !tokenExists) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        const values = profile.values[mode];
        if (reset) {
            delete values[tokenId];
        } else {
            values[tokenId] = requiredText(input.value);
        }
        const system = await dependencies.repo.updateSystem({ theme }, expectedRevision);
        return {
            revision: expectedRevision + 1,
            activeThemeId: system.theme.activeThemeId,
            themeId,
            mode,
            tokenId,
            value: system.theme.themes.find(({ id }) => id === themeId)?.values[mode]?.[tokenId] ?? "",
            overridden: !reset,
        };
    });
}

async function readTheme(dependencies: CmsContentDependencies, siteId: string) {
    const [snapshot, collections] = await Promise.all([
        readSystemSnapshot(dependencies.repo),
        dependencies.collections.snapshot(siteId),
    ]);
    return {
        revision: snapshot.revision,
        theme: composeCollectionThemes(
            snapshot.system.theme,
            collections.collections.map(({ release }) => release),
            snapshot.system.site.language,
        ),
    };
}

function themeMode(value: unknown): ThemeMode {
    if (value !== "light" && value !== "dark") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
