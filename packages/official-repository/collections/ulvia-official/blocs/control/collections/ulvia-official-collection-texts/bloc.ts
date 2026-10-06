import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { localizationCapability } from "./runtime/client";
import { itemGroup, type LocalizationOverview, type TextCatalogue } from "./runtime/model";
import { renderGroups, renderItems, renderLocales } from "./runtime/render";
import { initializeTextsWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    static observedAttributes = ["collection-id"];
    private catalogue: TextCatalogue | null = null;
    private overview: LocalizationOverview | null = null;
    private group = "";
    private query = "";
    private busy = false;

    constructor() {
        super({ css, template });
        initializeTextsWorkspace(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("change", this.handleChange);
        this.shadowRoot?.addEventListener("input", this.handleInput);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("change", this.handleChange);
        this.shadowRoot?.removeEventListener("input", this.handleInput);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            void this.load();
        }
    }

    private load(locale?: string): Promise<void> {
        return this.run(async () => {
            const collectionId = this.getAttribute("collection-id") ?? "";
            const [overview, catalogue] = await Promise.all([
                this.overview
                    ? Promise.resolve(this.overview)
                    : localizationCapability<LocalizationOverview>("overview", {}),
                localizationCapability<TextCatalogue>("get-texts", {
                    collectionId,
                    ...(locale ? { locale } : {}),
                }),
            ]);
            this.overview = overview;
            this.catalogue = catalogue;
            this.render();
        });
    }

    private readonly handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (button?.dataset.group) {
            this.group = button.dataset.group;
            this.render();
        } else if (button?.dataset.action === "save") {
            void this.save();
        }
    };

    private readonly handleChange = (event: Event): void => {
        if (event.target instanceof HTMLSelectElement && event.target.matches("[data-locale]")) {
            void this.load(event.target.value);
        }
    };

    private readonly handleInput = (event: Event): void => {
        if (event.target instanceof HTMLInputElement && event.target.matches("[data-search]")) {
            this.query = event.target.value.trim().toLowerCase();
            this.renderItems();
        }
    };

    private save(): Promise<void> {
        return this.run(async () => {
            if (!this.catalogue) {
                return;
            }
            const locale = this.required<HTMLSelectElement>("[data-locale]").value;
            const overrides = JSON.parse(this.catalogue.overridesJson) as Record<string, Record<string, string>>;
            const current = { ...(overrides[locale] ?? {}) };
            for (const input of this.shadowRoot!.querySelectorAll<HTMLTextAreaElement>("[data-text-id]")) {
                const value = input.value;
                if (value) {
                    current[input.dataset.textId!] = value;
                } else {
                    delete current[input.dataset.textId!];
                }
            }
            if (Object.keys(current).length) {
                overrides[locale] = current;
            } else {
                delete overrides[locale];
            }
            this.catalogue = await localizationCapability<TextCatalogue>("save-texts", {
                collectionId: this.catalogue.collectionId,
                expectedRevision: this.catalogue.revision,
                locale,
                overridesJson: JSON.stringify(overrides),
            });
            this.render();
        }, "Translations saved.");
    }

    private render(): void {
        if (!this.catalogue || !this.overview) {
            return;
        }
        const empty = this.required<HTMLElement>("[data-empty]");
        const editor = this.required<HTMLElement>("[data-editor]");
        empty.hidden = this.catalogue.items.length > 0;
        editor.hidden = this.catalogue.items.length === 0;
        const locale = renderLocales(this.required("[data-locale]"), this.catalogue, [
            this.overview.language,
            ...this.overview.activeLanguages,
            ...this.overview.additionalLanguages,
        ]);
        this.group = renderGroups(this.required("[data-groups]"), this.catalogue.items, this.group);
        this.required("[data-group-title]").textContent = this.group || "Collection texts";
        const first = this.catalogue.items.find((item) => itemGroup(item) === this.group);
        this.required("[data-category]").textContent = first?.category ?? "Translations";
        this.renderItems(locale);
    }

    private renderItems(locale = this.required<HTMLSelectElement>("[data-locale]").value): void {
        if (!this.catalogue) {
            return;
        }
        const count = renderItems(this.required("[data-items]"), this.catalogue.items, locale, this.group, this.query);
        this.required("[data-count]").textContent = String(count);
    }

    private async run(task: () => Promise<void>, success = ""): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.shadowRoot!.host.setAttribute("aria-busy", "true");
        this.notice("Loading texts…");
        try {
            await task();
            this.notice(success);
        } catch (error) {
            this.notice(error instanceof Error ? error.message : "Text request failed.", true);
        } finally {
            this.shadowRoot!.host.setAttribute("aria-busy", "false");
            this.busy = false;
        }
    }

    private notice(message: string, error = false): void {
        const notice = this.required("[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }

    private required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.shadowRoot?.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing collection texts element: ${selector}`);
        }
        return element;
    }
}
