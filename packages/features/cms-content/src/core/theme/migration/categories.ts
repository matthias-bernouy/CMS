import type { ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

const CUSTOM_SOURCE_ID = "custom";
const CUSTOM_CATEGORY_ID = "variables";

export function isColorValue(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$|var\(--)/i.test(
        value,
    );
}

export function categoryForVariable(settings: ThemeSettings, _variable: string): ThemeSource["categories"][number] {
    let source = settings.sources.find((item) => item.id === CUSTOM_SOURCE_ID);
    if (!source) {
        source = {
            id: CUSTOM_SOURCE_ID,
            label: "Site variables",
            supportsModes: true,
            categories: [],
        };
        settings.sources.push(source);
    }
    let category = source.categories.find((item) => item.id === CUSTOM_CATEGORY_ID);
    if (!category) {
        category = {
            id: CUSTOM_CATEGORY_ID,
            label: "Variables",
            description: "Variables created by this site and reusable by installed integrations.",
            tokens: [],
        };
        source.categories.push(category);
    }
    return category;
}
