import { itemGroup, overrideValue, sourceValue, type TextCatalogue, type TextItem } from "./model";

export function renderLocales(target: HTMLSelectElement, catalogue: TextCatalogue, preferred: string[]): string {
    const locales = new Set([
        catalogue.locale,
        ...preferred,
        ...catalogue.items.flatMap((item) => [...item.values, ...item.overrides].map(({ locale }) => locale)),
    ]);
    const selected = target.value || catalogue.locale || preferred[0] || [...locales][0] || "en";
    target.replaceChildren(
        ...[...locales].filter(Boolean).map((locale) => {
            const option = document.createElement("option");
            option.value = locale;
            option.textContent = languageLabel(locale);
            option.selected = locale === selected;
            return option;
        }),
    );
    return target.value || selected;
}

export function renderGroups(target: Element, items: TextItem[], selected: string): string {
    const groups = [...new Set(items.map(itemGroup))];
    const active = groups.includes(selected) ? selected : (groups[0] ?? "");
    target.replaceChildren(
        ...groups.map((group) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.group = group;
            setCurrent(button, group === active);
            const label = document.createElement("span");
            label.textContent = group;
            const count = document.createElement("small");
            count.textContent = String(items.filter((item) => itemGroup(item) === group).length);
            button.append(label, count);
            return button;
        }),
    );
    return active;
}

export function renderItems(target: Element, items: TextItem[], locale: string, group: string, query: string): number {
    const visible = items.filter((item) => {
        const searchable = `${item.label ?? ""} ${item.description ?? ""} ${item.id}`.toLowerCase();
        return itemGroup(item) === group && (!query || searchable.includes(query));
    });
    target.replaceChildren(...visible.map((item) => textRow(item, locale)));
    if (!visible.length) {
        const empty = document.createElement("p");
        empty.setAttribute("part", "filter-empty");
        empty.textContent = query ? "No text matches this search." : "This group is empty.";
        target.append(empty);
    }
    return visible.length;
}

function textRow(item: TextItem, locale: string): HTMLElement {
    const row = document.createElement("article");
    row.setAttribute("part", "text-row");
    const context = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = item.label || item.id;
    const description = document.createElement("p");
    description.textContent = item.description || item.id;
    const key = document.createElement("code");
    key.textContent = item.id;
    context.append(label, description, key);
    const source = document.createElement("div");
    source.setAttribute("part", "source-value");
    const sourceLabel = document.createElement("span");
    sourceLabel.textContent = "Collection value";
    const sourceText = document.createElement("p");
    sourceText.textContent = sourceValue(item, locale) || "Not translated in this locale";
    source.append(sourceLabel, sourceText);
    const field = document.createElement("label");
    field.textContent = "Site override";
    const input = document.createElement("textarea");
    input.rows = 3;
    input.dataset.textId = item.id;
    input.value = overrideValue(item, locale);
    input.placeholder = sourceValue(item, locale);
    input.setAttribute("aria-label", `${locale} override for ${item.label || item.id}`);
    field.append(input);
    row.append(context, source, field);
    return row;
}

function setCurrent(element: Element, current: boolean): void {
    if (current) {
        element.setAttribute("aria-current", "page");
    } else {
        element.removeAttribute("aria-current");
    }
}

function languageLabel(locale: string): string {
    try {
        return `${new Intl.DisplayNames(undefined, { type: "language" }).of(locale) ?? locale} · ${locale}`;
    } catch {
        return locale;
    }
}
