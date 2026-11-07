import { readSystemSnapshot } from "cms-content/settings/core/readSystemSnapshot";
import type { ThemeMode } from "cms-content/theme/interfaces/theme";
import type { ContentServices } from "cms-content/application/interfaces/ContentServices";
import { ContentCapabilityError } from "./errors";
import { revision, requiredText } from "./input";
export async function mutateToken(
    services: ContentServices,
    siteId: string,
    input: Record<string, unknown>,
    reset: boolean,
) {
    const expectedRevision = revision(input.expectedRevision);
    const themeId = requiredText(input.themeId);
    const tokenId = requiredText(input.tokenId);
    const mode = themeMode(input.mode);
    const { theme } = await readTheme(services, siteId);
    const profile = theme.themes.find(({ id }) => id === themeId);
    const tokenExists = theme.sources.some((source) =>
        source.categories.some((category) => category.tokens.some(({ id }) => id === tokenId)),
    );
    if (!profile || !tokenExists) {
        throw new ContentCapabilityError("NOT_FOUND");
    }
    const values = profile.values[mode];
    if (reset) {
        delete values[tokenId];
    } else {
        values[tokenId] = requiredText(input.value);
    }
    const system = await services.repo.updateSystem({ theme }, expectedRevision);
    return {
        revision: expectedRevision + 1,
        activeThemeId: system.theme.activeThemeId,
        themeId,
        mode,
        tokenId,
        value: system.theme.themes.find(({ id }) => id === themeId)?.values[mode]?.[tokenId] ?? "",
        overridden: !reset,
    };
}

export async function readTheme(services: ContentServices, siteId: string) {
    const [snapshot, contributions] = await Promise.all([
        readSystemSnapshot(services.repo),
        services.contributions.snapshot(siteId),
    ]);
    return {
        revision: snapshot.revision,
        theme: contributions.theme(snapshot.system.theme, snapshot.system.site.language),
    };
}

function themeMode(value: unknown): ThemeMode {
    if (value !== "light" && value !== "dark") {
        throw new ContentCapabilityError("INVALID_INPUT");
    }
    return value;
}
