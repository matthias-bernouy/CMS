import type { ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

type CategoryTarget = {
    sourceId: string;
    sourceLabel: string;
    supportsModes: boolean;
    categoryId: string;
    categoryLabel: string;
    description: string;
};

export function isColorValue(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$|var\(--)/i.test(
        value,
    );
}

export function categoryForVariable(settings: ThemeSettings, variable: string): ThemeSource["categories"][number] {
    const target = variableCategory(variable);
    let source = settings.sources.find((item) => item.id === target.sourceId);
    if (!source) {
        source = {
            id: target.sourceId,
            label: target.sourceLabel,
            supportsModes: target.supportsModes,
            categories: [],
        };
        settings.sources.push(source);
    }
    let category = source.categories.find((item) => item.id === target.categoryId);
    if (!category) {
        category = { id: target.categoryId, label: target.categoryLabel, description: target.description, tokens: [] };
        source.categories.push(category);
    }
    return category;
}

function variableCategory(variable: string): CategoryTarget {
    if (/^(success|warning|danger|info)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "feedback", "Feedback", "Colors used for semantic states.");
    }
    if (/^(primary|secondary|link)(-|$)/.test(variable)) {
        return target(
            "colors",
            "Colors",
            true,
            "brand",
            "Brand",
            "Primary choices for calls to action and highlights.",
        );
    }
    if (/^(text|ctx-fg)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "text", "Text", "Readable foreground colors.");
    }
    if (/^(bg|border|ctx-bg|ctx-border|divider|image)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "surfaces", "Surfaces", "The page canvas, cards and their borders.");
    }
    if (/^(font|line-height|letter-spacing)(-|$)/.test(variable)) {
        const scale = /^(font-size|line-height|letter-spacing)(-|$)/.test(variable);
        return target(
            "typography",
            "Typography",
            false,
            scale ? "text-scale" : "font-families",
            scale ? "Text scale" : "Font families",
            scale ? "Shared type sizes and rhythm." : "Fonts applied to headings and body copy.",
        );
    }
    if (/^(space|p9r-space|gap|padding|margin)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "spacing-scale", "Spacing scale", "Shared spacing steps.");
    }
    if (/^(content-width|wide-width|p9r-container|max-width|min-width|container)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "layout", "Layout", "Widths and page rhythm.");
    }
    if (/^(radius|p9r-radius)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "corners",
            "Corners",
            "Rounding applied to controls and cards.",
        );
    }
    if (/^(shadow|ctx-shadow)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "elevation",
            "Elevation",
            "Shadows used to separate surfaces.",
        );
    }
    if (/^(duration|transition|easing)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "motion",
            "Motion",
            "Shared transition durations and easing values.",
        );
    }
    return target(
        "imported-css",
        "Imported CSS",
        false,
        "general",
        "Imported variables",
        "Variables preserved from the former free-form stylesheet.",
    );
}

function target(
    sourceId: string,
    sourceLabel: string,
    supportsModes: boolean,
    categoryId: string,
    categoryLabel: string,
    description: string,
): CategoryTarget {
    return { sourceId, sourceLabel, supportsModes, categoryId, categoryLabel, description };
}
