import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { callCapability, CapabilityError } from "./runtime/client";
import type { DesignOverview, LanguagesDocument, TextCatalogue, ThemeDocument } from "./runtime/model";
import { DesignView } from "./runtime/view";
import { initializeWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    private lifecycle = new AbortController();
    private overview: DesignOverview | null = null;
    private theme: ThemeDocument | null = null;
    private texts: TextCatalogue | null = null;
    private busy = false;
    private readonly view: DesignView;

    constructor() {
        super({ css, template });
        initializeWorkspace(this.shadowRoot!);
        this.view = new DesignView(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.lifecycle = new AbortController();
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("submit", this.handleSubmit);
        void this.load();
    }

    disconnectedCallback(): void {
        this.lifecycle.abort();
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    }

    private load = (): Promise<void> =>
        this.run(async () => {
            [this.overview, this.theme] = await Promise.all([
                callCapability<DesignOverview>("overview", {}, this.lifecycle.signal),
                callCapability<ThemeDocument>("get-theme", {}, this.lifecycle.signal),
            ]);
            this.view.populate(this.overview, this.theme);
        }, "Design configuration refreshed.");

    private handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (button?.dataset.tab) {
            this.view.selectTab(button.dataset.tab);
        } else if (button?.dataset.action === "refresh") {
            void this.load();
        }
    };

    private handleSubmit = (event: Event): void => {
        if (!(event.target instanceof HTMLFormElement)) {
            return;
        }
        event.preventDefault();
        const action = event.target.dataset.form;
        if (action === "languages") {
            void this.saveLanguages();
        } else if (action === "theme") {
            void this.saveTheme();
        } else if (action === "load-texts") {
            void this.loadTexts();
        } else if (action === "texts") {
            void this.saveTexts();
        }
    };

    private saveLanguages(): Promise<void> {
        return this.run(async () => {
            if (!this.overview) {
                return;
            }
            const languages = await callCapability<LanguagesDocument>(
                "update-languages",
                {
                    expectedRevision: this.overview.revision,
                    language: this.view.required<HTMLInputElement>("[data-language]").value.trim(),
                    additionalLanguages: tags(this.view.required<HTMLInputElement>("[data-additional]").value),
                    activeLanguages: tags(this.view.required<HTMLInputElement>("[data-active]").value),
                },
                this.lifecycle.signal,
            );
            this.overview = { ...this.overview, ...languages };
            this.view.populateLanguages(languages);
        }, "Languages saved.");
    }

    private saveTheme(): Promise<void> {
        return this.run(async () => {
            if (!this.theme) {
                return;
            }
            const themeJson = validJson(this.view.required<HTMLTextAreaElement>("[data-theme]").value, "Theme");
            this.theme = await callCapability<ThemeDocument>(
                "save-theme",
                { expectedRevision: this.theme.revision, themeJson },
                this.lifecycle.signal,
            );
            this.view.populateTheme(this.theme);
        }, "Theme saved.");
    }

    private loadTexts(): Promise<void> {
        return this.run(async () => {
            const collectionId = this.view.required<HTMLSelectElement>("[data-collection]").value;
            const locale = this.view.required<HTMLInputElement>("[data-locale]").value.trim();
            this.texts = await callCapability<TextCatalogue>(
                "get-texts",
                { collectionId, locale },
                this.lifecycle.signal,
            );
            this.view.populateTexts(this.texts);
        }, "Text catalogue loaded.");
    }

    private saveTexts(): Promise<void> {
        return this.run(async () => {
            if (!this.texts) {
                return;
            }
            const overridesJson = validJson(
                this.view.required<HTMLTextAreaElement>("[data-overrides]").value,
                "Text overrides",
            );
            this.texts = await callCapability<TextCatalogue>(
                "save-texts",
                {
                    collectionId: this.texts.collectionId,
                    expectedRevision: this.texts.revision,
                    locale: this.texts.locale,
                    overridesJson,
                },
                this.lifecycle.signal,
            );
            this.view.populateTexts(this.texts);
        }, "Text overrides saved.");
    }

    private async run(task: () => Promise<void>, success: string): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.view.setBusy(true);
        this.view.notice("Working…");
        try {
            await task();
            this.view.notice(success);
        } catch (error) {
            const suffix = error instanceof CapabilityError ? ` (${error.code})` : "";
            this.view.notice(`${error instanceof Error ? error.message : "Request failed"}${suffix}`, true);
        } finally {
            this.view.setBusy(false);
            this.busy = false;
        }
    }
}

const tags = (value: string): string[] =>
    value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

function validJson(value: string, label: string): string {
    try {
        JSON.parse(value);
        return value;
    } catch {
        throw new Error(`${label} must be valid JSON.`);
    }
}
