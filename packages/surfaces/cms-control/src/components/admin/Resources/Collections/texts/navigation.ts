import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { CollectionText } from "@bernouy/cms-repository/collections/texts";
export function textGroup(text: CollectionText): string {
    return JSON.stringify([text.category ?? "General", text.group ?? "Texts"]);
}
export function languageLabel(locale: string): string {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
}
export function renderTextNavigation(
    host: HTMLElement,
    texts: readonly CollectionText[],
    selected: string,
    choose: (key: string) => void,
) {
    const categories = new Map<string, Map<string, string>>();
    for (const text of texts) {
        const category = text.category ?? "General";
        if (!categories.has(category)) {
            categories.set(category, new Map());
        }
        categories.get(category)!.set(textGroup(text), text.group ?? "Texts");
    }
    host.replaceChildren();
    for (const [category, groups] of categories) {
        const section = document.createElement("w13c-lateral-menu-section");
        section.setAttribute("label", category);
        section.setAttribute("count", String(groups.size));
        section.setAttribute("open", "");
        section.setAttribute("sticky", "");
        for (const [key, label] of groups) {
            const item = document.createElement("w13c-lateral-menu-item");
            item.textContent = label;
            item.setAttribute("manual-active", "");
            item.toggleAttribute("active", key === selected);
            item.setAttribute("aria-label", label);
            item.addEventListener("click", () => choose(key));
            section.append(item);
            if (key === selected) {
                host.setAttribute("compact-label", label);
            }
        }
        host.append(section);
    }
}

export function renderTextLanguages(
    select: HTMLElement & { value: string },
    item: InstalledCollection,
    siteLanguages: string[],
    current: string,
): string {
    const locales = [
        ...new Set(
            [
                item.release.locale,
                ...siteLanguages,
                ...(item.release.texts ?? []).flatMap((text) => Object.keys(text.values)),
            ].filter(Boolean),
        ),
    ];
    select.replaceChildren(
        ...locales.map((locale) => {
            const option = document.createElement("option");
            option.value = locale;
            option.textContent = languageLabel(locale);
            return option;
        }),
    );
    const selected = current || locales.find((locale) => locale !== item.release.locale) || item.release.locale;
    select.value = selected;
    return selected;
}
