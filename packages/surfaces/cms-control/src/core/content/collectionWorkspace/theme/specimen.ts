import type { CollectionThemeSource } from "../themeSources";
import type { CollectionThemeDetailView, CollectionThemeTokenView } from "../types";

const AUTOMATIC_OVERVIEW_BINDINGS: Record<string, readonly string[]> = {
    page: ["page-background"],
    surface: ["surface-background"],
    subtle: ["subtle-background"],
    heading: ["surface-text", "heading-text"],
    body: ["body-text"],
    muted: ["surface-muted-text", "muted-text"],
    border: ["surface-border"],
    accent: ["primary-base", "accent-base"],
    "accent-foreground": ["primary-foreground", "accent-foreground"],
    "accent-muted": ["primary-muted", "accent-muted"],
    "accent-contrasted": ["primary-contrasted", "accent-contrasted"],
    secondary: ["secondary-base"],
    "secondary-foreground": ["secondary-foreground"],
    info: ["info-muted", "info-base"],
    success: ["success-muted", "success-base"],
    warning: ["warning-muted", "warning-base"],
    danger: ["danger-muted", "danger-base"],
    "font-body": ["font-body"],
    "font-heading": ["font-heading"],
    radius: ["radius-card", "radius-md"],
    shadow: ["shadow-soft", "shadow-md"],
};

export function themeSpecimen(
    sources: CollectionThemeSource[],
    tokens: CollectionThemeTokenView[],
    active: CollectionThemeTokenView | undefined,
    related: CollectionThemeDetailView["relatedTokens"],
): CollectionThemeDetailView["specimen"] {
    const previewSource = [...sources].reverse().find(({ definition }) => definition.theme?.preview);
    const preview = previewSource?.definition.theme?.preview;
    const bindings = preview
        ? Object.fromEntries(
              Object.entries(preview.bindings).map(([slot, tokenId]) => [
                  slot,
                  `${previewSource!.integrationId}-${tokenId}`,
              ]),
          )
        : automaticPreviewBindings(active, tokens);
    return {
        kind: preview?.kind ?? "interface",
        view: active ? "focus" : "overview",
        bindings,
        tokens: tokens.map(({ variable, lightResolved, darkResolved }) => ({
            variable,
            light: lightResolved,
            dark: darkResolved,
        })),
        ...(active ? { active: active.variable, activeType: active.type } : {}),
        focus: active ? [active.variable, ...related.map(({ variable }) => variable)] : [],
        represented: Boolean(active && Object.values(bindings).includes(active.variable)),
    };
}

function automaticPreviewBindings(
    token: CollectionThemeTokenView | undefined,
    tokens: CollectionThemeTokenView[],
): Record<string, string> {
    const overview = inferOverviewBindings(tokens);
    if (!token) {
        return overview;
    }
    const representedSlots = Object.entries(overview).filter(([, variable]) => variable === token.variable);
    if (representedSlots.length) {
        return Object.fromEntries(representedSlots);
    }
    if (token.type === "color") {
        return { accent: token.variable };
    }
    if (token.type === "font-family") {
        const role = /heading|display|title/iu.test(`${token.id} ${token.label}`) ? "font-heading" : "font-body";
        return { [role]: token.variable };
    }
    if (token.type === "shadow") {
        return { shadow: token.variable };
    }
    if (token.type === "length" && /radius/iu.test(`${token.id} ${token.label}`)) {
        return { radius: token.variable };
    }
    return {};
}

function inferOverviewBindings(tokens: CollectionThemeTokenView[]): Record<string, string> {
    const byId = new Map<string, CollectionThemeTokenView>();
    for (const token of tokens) {
        byId.set(token.id, token);
    }
    return Object.fromEntries(
        Object.entries(AUTOMATIC_OVERVIEW_BINDINGS).flatMap(([slot, candidates]) => {
            const token = candidates.map((candidate) => byId.get(candidate)).find(Boolean);
            return token ? [[slot, token.variable]] : [];
        }),
    );
}
