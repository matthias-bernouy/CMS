import type { CollectionThemeDetailView, CollectionThemeTokenView } from "./types";

type NavigationTarget = { label: string; href: string };

export function relatedThemeTokens(
    selected: CollectionThemeTokenView,
    tokens: CollectionThemeTokenView[],
    navigation: Map<string, NavigationTarget>,
): CollectionThemeDetailView["relatedTokens"] {
    const references = new Set([selected.lightReference, selected.darkReference].filter(isText));
    const usedBy = new Set(
        tokens
            .filter(
                (token) =>
                    token.variable !== selected.variable &&
                    (token.lightReference === selected.variable || token.darkReference === selected.variable),
            )
            .map(({ variable }) => variable),
    );
    return [
        ...relations(references, navigation, "References"),
        ...relations(usedBy, navigation, "Used by", references),
    ];
}

function relations(
    variables: Set<string>,
    navigation: Map<string, NavigationTarget>,
    relationship: "References" | "Used by",
    excluded = new Set<string>(),
): CollectionThemeDetailView["relatedTokens"] {
    return [...variables]
        .filter((variable) => !excluded.has(variable))
        .flatMap((variable) => {
            const target = navigation.get(variable);
            return target ? [{ variable, ...target, relationship }] : [];
        });
}

function isText(value: string | undefined): value is string {
    return Boolean(value);
}
