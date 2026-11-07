import type { z } from "zod";
import type { themeGetOutputSchema, themeGetInputSchema } from "cms-content/application/schemas/theme";
import type { ThemeMode, ThemeSettings, ThemeToken } from "cms-content/theme/interfaces/theme";
type ThemeWorkspace = z.output<typeof themeGetOutputSchema>;

export type ThemeWorkspaceSelection = Partial<z.input<typeof themeGetInputSchema>>;

export function projectThemeWorkspace(
    theme: ThemeSettings,
    revision: number,
    selection: ThemeWorkspaceSelection,
): ThemeWorkspace {
    const source = theme.sources.find(
        ({ owner }) => owner?.kind === "contribution" && owner.contributionId === (selection.collectionId ?? ""),
    );
    const profile =
        theme.themes.find(({ id }) => id === selection.profileId) ??
        theme.themes.find(({ id }) => id === theme.activeThemeId) ??
        theme.themes[0];
    const mode: ThemeMode = selection.mode === "dark" && source?.supportsModes ? "dark" : "light";
    const search = selection.search?.trim() ?? "";
    const normalizedSearch = search.toLowerCase();
    const tokens = (source?.categories ?? []).flatMap((category) =>
        category.tokens
            .filter((token) => {
                const searchable = `${category.label} ${token.label} ${token.id}`.toLowerCase();
                return !normalizedSearch || searchable.includes(normalizedSearch);
            })
            .map((token) => ({
                ...projectToken(profile, token, mode),
                categoryId: category.id,
                categoryLabel: category.label,
            })),
    );
    const token = tokens.find(({ id }) => id === selection.tokenId) ?? tokens[0];
    return {
        revision,
        collectionId: selection.collectionId ?? "",
        activeThemeId: theme.activeThemeId,
        profiles: theme.themes.map(({ id, name }) => ({ id, name, active: id === theme.activeThemeId })),
        profileId: profile?.id ?? "",
        profileActive: profile?.id === theme.activeThemeId,
        mode,
        search,
        sourceFound: Boolean(source),
        sourceLabel: source?.label ?? "",
        supportsModes: source?.supportsModes ?? false,
        tokens,
        hasToken: Boolean(token),
        token: token ?? emptyToken(),
    };
}

function projectToken(profile: ThemeSettings["themes"][number] | undefined, token: ThemeToken, mode: ThemeMode) {
    const overrides = profile?.values[mode] ?? {};
    return {
        id: token.id,
        label: token.label,
        description: token.description,
        variable: token.variable,
        type: token.type,
        value: overrides[token.id] ?? token.defaults?.[mode] ?? token.defaults?.light ?? "",
        overridden: Object.hasOwn(overrides, token.id),
    };
}

function emptyToken(): ThemeWorkspace["token"] {
    return {
        id: "",
        label: "",
        description: "",
        variable: "",
        type: "value",
        value: "",
        overridden: false,
        categoryId: "",
        categoryLabel: "",
    };
}
