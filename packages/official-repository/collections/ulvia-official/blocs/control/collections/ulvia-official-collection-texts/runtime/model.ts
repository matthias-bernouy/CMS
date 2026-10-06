export type TextValue = { locale: string; value: string };
export type TextItem = {
    id: string;
    generation: number;
    label?: string;
    description?: string;
    category?: string;
    group?: string;
    values: TextValue[];
    overrides: TextValue[];
};
export type TextCatalogue = {
    revision: number;
    collectionId: string;
    locale: string;
    overridesJson: string;
    items: TextItem[];
};
export type LocalizationOverview = {
    language: string;
    additionalLanguages: string[];
    activeLanguages: string[];
};

export function itemGroup(item: TextItem): string {
    return item.group?.trim() || item.category?.trim() || "General";
}

export function sourceValue(item: TextItem, locale: string): string {
    return item.values.find((value) => value.locale === locale)?.value ?? item.values[0]?.value ?? "";
}

export function overrideValue(item: TextItem, locale: string): string {
    return item.overrides.find((value) => value.locale === locale)?.value ?? "";
}
