import type { DesignOverview, TextCatalogue, ThemeDocument } from "./model";

export class DesignView {
    constructor(private readonly root: ShadowRoot) {}

    populate(overview: DesignOverview, theme: ThemeDocument): void {
        this.populateLanguages(overview);
        this.populateTheme(theme);
        const select = this.required<HTMLSelectElement>("[data-collection]");
        select.replaceChildren(...overview.collections.map(({ collectionId }) => option(collectionId)));
        this.required<HTMLInputElement>("[data-locale]").value = overview.language;
    }

    populateLanguages(languages: Pick<DesignOverview, "language" | "additionalLanguages" | "activeLanguages">): void {
        this.required<HTMLInputElement>("[data-language]").value = languages.language;
        setTagValue(this.required<HTMLInputElement>("[data-additional]"), languages.additionalLanguages);
        setTagValue(this.required<HTMLInputElement>("[data-active]"), languages.activeLanguages);
    }

    populateTheme(theme: ThemeDocument): void {
        this.required<HTMLTextAreaElement>("[data-theme]").value = theme.themeJson;
        this.required("[data-theme-meta]").textContent =
            `Active theme ${theme.activeThemeId} · revision ${theme.revision}`;
    }

    populateTexts(texts: TextCatalogue | null): void {
        const textarea = this.required<HTMLTextAreaElement>("[data-overrides]");
        const save = this.required<HTMLButtonElement>("[data-save-texts]");
        textarea.disabled = !texts;
        save.disabled = !texts;
        textarea.value = texts?.overridesJson ?? "{}";
        this.required("[data-text-meta]").textContent = texts
            ? `${texts.collectionId} · ${texts.locale || "all locales"} · revision ${texts.revision}`
            : "Select and load a collection catalogue first.";
        const target = this.required("[data-text-items]");
        target.replaceChildren(...(texts?.items.slice(0, 20).map(textItem) ?? []));
    }

    selectTab(tab: string): void {
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === tab));
        }
        for (const panel of this.root.querySelectorAll<HTMLElement>("[data-panel]")) {
            panel.hidden = panel.dataset.panel !== tab;
        }
    }

    setBusy(busy: boolean): void {
        this.required("[part=workspace]").setAttribute("aria-busy", String(busy));
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("button")) {
            if (busy) {
                button.dataset.disabledBeforeBusy = String(button.disabled);
                button.disabled = true;
            } else {
                button.disabled = button.dataset.disabledBeforeBusy === "true";
                delete button.dataset.disabledBeforeBusy;
            }
        }
    }

    notice(message: string, error = false): void {
        const notice = this.required("[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }

    required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing design manager element: ${selector}`);
        }
        return element;
    }
}

function setTagValue(input: HTMLInputElement, values: string[]): void {
    input.value = values.join(",");
    input.setAttribute("value", input.value);
}

function option(value: string): HTMLOptionElement {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = value;
    return item;
}

function textItem(item: TextCatalogue["items"][number]): HTMLElement {
    const row = document.createElement("article");
    row.setAttribute("part", "text-item");
    const title = document.createElement("strong");
    title.textContent = item.label || item.id;
    const id = document.createElement("code");
    id.textContent = `${item.id} · generation ${item.generation}`;
    const summary = document.createElement("small");
    summary.textContent = `${item.values.length} source values · ${item.overrides.length} overrides`;
    row.append(title, id, summary);
    return row;
}
