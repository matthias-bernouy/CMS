import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsContentDependencies } from "../../ports";

type CollectionInstallation = Awaited<
    ReturnType<CmsContentDependencies["collections"]["snapshot"]>
>["collections"][number];

export type TextCatalogueSelection = Readonly<{
    locale?: string;
    group?: string;
    search?: string;
    siteLocales?: readonly string[];
}>;

export function projectTextCatalogue(
    revision: number,
    installation: CollectionInstallation,
    selection: TextCatalogueSelection = {},
) {
    const { collectionId, release, textOverrides } = installation;
    const locale = selection.locale || release.locale;
    const allItems = (release.texts ?? []).map((text) => {
        const values = Object.entries(text.values).sort(([left], [right]) => left.localeCompare(right));
        const overrides = Object.entries(textOverrides[text.id] ?? {}).sort(([left], [right]) =>
            left.localeCompare(right),
        );
        return {
            id: text.id,
            generation: text.generation ?? 1,
            label: text.label ? resolveCollectionTranslation(release, text.label, locale) : text.id,
            description: text.description ? resolveCollectionTranslation(release, text.description, locale) : text.id,
            category: text.category ? resolveCollectionTranslation(release, text.category, locale) : "",
            group: text.group ? resolveCollectionTranslation(release, text.group, locale) : "",
            sourceValue: values.find(([candidate]) => candidate === locale)?.[1] ?? values[0]?.[1] ?? "",
            overrideValue: overrides.find(([candidate]) => candidate === locale)?.[1] ?? "",
        };
    });
    const groups = [...new Set(allItems.map(({ group, category }) => group || category).filter(Boolean))].map((id) => ({
        id,
        count: allItems.filter(({ group, category }) => (group || category) === id).length,
    }));
    const group = groups.some(({ id }) => id === selection.group) ? selection.group! : (groups[0]?.id ?? "");
    const search = selection.search?.trim() ?? "";
    const normalizedSearch = search.toLocaleLowerCase(locale);
    const items = allItems.filter((item) => {
        const itemGroup = item.group || item.category;
        const matchesGroup = !group || itemGroup === group;
        const searchable = `${item.label} ${item.description} ${item.id}`.toLocaleLowerCase(locale);
        return matchesGroup && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
    const locales = new Set([release.locale, ...(selection.siteLocales ?? [])]);
    for (const text of release.texts ?? []) {
        Object.keys(text.values).forEach((candidate) => locales.add(candidate));
        Object.keys(textOverrides[text.id] ?? {}).forEach((candidate) => locales.add(candidate));
    }
    locales.add(locale);
    return {
        revision,
        collectionId,
        locale,
        locales: [...locales].filter(Boolean).sort((left, right) => left.localeCompare(right)),
        group,
        groups,
        search,
        items,
    };
}
