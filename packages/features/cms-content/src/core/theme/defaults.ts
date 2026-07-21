import type { ThemeDefinition, ThemeSettings, ThemeSource, ThemeToken } from "cms-content/interfaces/theme";

const DEFAULT_VALUES: Record<string, string> = {
    "primary-base": "#16634d",
    "primary-contrasted": "#ffffff",
    "secondary-base": "#e7eee9",
    "secondary-contrasted": "#17362c",
    "bg-base": "#f9f7f1",
    "bg-surface": "#ffffff",
    "border-default": "#dfddd4",
    "text-main": "#26261f",
    "text-muted": "#6d6b63",
    "success-base": "#21865f",
    "warning-base": "#b7791f",
    "danger-base": "#c4473d",
    "font-heading": "Georgia, serif",
    "font-body": "Inter, system-ui, sans-serif",
    "font-size-body": "1rem",
    "font-size-display": "3.5rem",
    "space-sm": ".5rem",
    "space-md": "1rem",
    "space-xl": "3rem",
    "content-width": "68rem",
    "wide-width": "82rem",
    "radius-control": ".25rem",
    "radius-card": ".5rem",
    "shadow-soft": "0 2px 10px rgb(18 30 24 / .08)",
};

export function defaultThemeSettings(): ThemeSettings {
    const sources: ThemeSource[] = [
        source("colors", "Colors", true, [
            category("brand", "Brand", "Primary choices for calls to action and highlights.", [
                token("primary-base", "Primary", "Buttons and links", "color"),
                token("primary-contrasted", "Primary text", "Text placed on primary", "color"),
                token("secondary-base", "Secondary", "Secondary controls", "color"),
                token("secondary-contrasted", "Secondary text", "Text placed on secondary", "color"),
            ]),
            category("surfaces", "Surfaces", "The page canvas, cards and their borders.", [
                token("bg-base", "Page background", "Main canvas", "color"),
                token("bg-surface", "Surface", "Cards and panels", "color"),
                token("border-default", "Border", "Dividers and controls", "color"),
            ]),
            category("text", "Text", "Readable foreground colors.", [
                token("text-main", "Text", "Primary copy", "color"),
                token("text-muted", "Muted text", "Secondary copy", "color"),
            ]),
            category("feedback", "Feedback", "Colors used for semantic states.", [
                token("success-base", "Success", "Successful operations", "color"),
                token("warning-base", "Warning", "Warnings and cautions", "color"),
                token("danger-base", "Danger", "Errors and destructive actions", "color"),
            ]),
        ]),
        source("typography", "Typography", false, [
            category("font-families", "Font families", "Fonts applied to headings and body copy.", [
                token("font-heading", "Heading font", "Titles and headings", "value"),
                token("font-body", "Body font", "Paragraphs and controls", "value"),
            ]),
            category("text-scale", "Text scale", "Shared text sizes used across the site.", [
                token("font-size-body", "Body size", "Default text", "value"),
                token("font-size-display", "Display size", "Large headings", "value"),
            ]),
        ]),
        source("spacing", "Spacing", false, [
            category("spacing-scale", "Spacing scale", "Shared spacing steps.", [
                token("space-sm", "Compact", "Inline gaps", "value"),
                token("space-md", "Default", "Default block gap", "value"),
                token("space-xl", "Generous", "Section spacing", "value"),
            ]),
            category("layout", "Layout", "Widths and page rhythm.", [
                token("content-width", "Content width", "Readable content", "value"),
                token("wide-width", "Wide width", "Wide page sections", "value"),
            ]),
        ]),
        source("shape", "Shape & effects", false, [
            category("corners", "Corners", "Rounding applied to controls and cards.", [
                token("radius-control", "Control radius", "Inputs and buttons", "value"),
                token("radius-card", "Card radius", "Panels and cards", "value"),
            ]),
            category("elevation", "Elevation", "Shadows used to separate surfaces.", [
                token("shadow-soft", "Soft shadow", "Subtle elevation", "value"),
            ]),
            category("motion", "Motion", "Shared transition durations and easing values.", []),
        ]),
    ];
    const theme: ThemeDefinition = {
        id: "default",
        name: "Default theme",
        values: { light: { ...DEFAULT_VALUES }, dark: {} },
    };
    return { activeThemeId: theme.id, sources, themes: [theme] };
}

function source(id: string, label: string, supportsModes: boolean, categories: ThemeSource["categories"]): ThemeSource {
    return { id, label, supportsModes, categories };
}

function category(
    id: string,
    label: string,
    description: string,
    tokens: ThemeToken[],
): ThemeSource["categories"][number] {
    return { id, label, description, tokens };
}

function token(id: string, label: string, description: string, type: ThemeToken["type"]): ThemeToken {
    return { id, variable: id, label, description, type };
}
