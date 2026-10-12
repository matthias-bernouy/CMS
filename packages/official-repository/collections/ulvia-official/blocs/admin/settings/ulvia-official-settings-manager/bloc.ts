import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { callCapability, CapabilityError } from "./runtime/client";
import type { AccessOverview, LanguageSettings, LocalizationOverview, SiteSettings } from "./runtime/model";
import { initializeSettingsWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    private site: SiteSettings | null = null;
    private languages: LocalizationOverview | null = null;
    private busy = false;

    constructor() {
        super({ css, template });
        initializeSettingsWorkspace(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("submit", this.handleSubmit);
        this.selectSection(location.hash === "#settings-languages" ? "languages" : "general");
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    }

    private load(): Promise<void> {
        return this.run(async () => {
            const [access, localization] = await Promise.all([
                callCapability<AccessOverview>("ulvia.cms.access", "overview", { limit: 1 }),
                callCapability<LocalizationOverview>("ulvia.cms.localization", "overview", {}),
            ]);
            this.site = access.site;
            this.languages = localization;
            this.populate();
        });
    }

    private readonly handleClick = (event: Event): void => {
        const section = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-section]")?.dataset.section;
        if (section) {
            this.selectSection(section);
            history.replaceState(null, "", `${location.pathname}${location.search}#settings-${section}`);
        }
    };

    private readonly handleSubmit = (event: Event): void => {
        if (!(event.target instanceof HTMLFormElement)) {
            return;
        }
        event.preventDefault();
        void (event.target.dataset.form === "general" ? this.saveGeneral() : this.saveLanguages());
    };

    private saveGeneral(): Promise<void> {
        return this.run(async () => {
            if (!this.site) {
                return;
            }
            this.site = await callCapability<SiteSettings>("ulvia.cms.access", "update-site", {
                expectedRevision: this.site.revision,
                name: this.required<HTMLInputElement>("[data-site-name]").value.trim(),
                host: this.required<HTMLInputElement>("[data-site-host]").value.trim(),
                visible: this.required<HTMLSelectElement>("[data-site-visible]").value === "true",
            });
            if (this.languages) {
                this.languages.revision = this.site.revision;
            }
            this.populateGeneral();
        }, "General settings saved.");
    }

    private saveLanguages(): Promise<void> {
        return this.run(async () => {
            if (!this.languages) {
                return;
            }
            const next = await callCapability<LanguageSettings>("ulvia.cms.localization", "update-languages", {
                expectedRevision: this.languages.revision,
                language: this.required<HTMLInputElement>("[data-language]").value.trim(),
                additionalLanguages: tags(this.required<HTMLInputElement>("[data-additional]").value),
                activeLanguages: tags(this.required<HTMLInputElement>("[data-active]").value),
            });
            this.languages = { ...this.languages, ...next };
            if (this.site) {
                this.site.revision = next.revision;
            }
            this.populateLanguages();
        }, "Languages saved.");
    }

    private populate(): void {
        this.populateGeneral();
        this.populateLanguages();
    }

    private populateGeneral(): void {
        if (!this.site) {
            return;
        }
        this.required<HTMLInputElement>("[data-site-name]").value = this.site.name;
        this.required<HTMLInputElement>("[data-site-host]").value = this.site.host;
        this.required<HTMLSelectElement>("[data-site-visible]").value = String(this.site.visible);
    }

    private populateLanguages(): void {
        if (!this.languages) {
            return;
        }
        this.required<HTMLInputElement>("[data-language]").value = this.languages.language;
        setTags(this.required<HTMLInputElement>("[data-additional]"), this.languages.additionalLanguages);
        setTags(this.required<HTMLInputElement>("[data-active]"), this.languages.activeLanguages);
    }

    private selectSection(section: string): void {
        for (const button of this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-section]")) {
            if (button.dataset.section === section) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        }
        for (const panel of this.shadowRoot!.querySelectorAll<HTMLElement>("[data-panel]")) {
            panel.hidden = panel.dataset.panel !== section;
        }
    }

    private async run(task: () => Promise<void>, success = ""): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.setBusy(true);
        this.notice("Working…");
        try {
            await task();
            this.notice(success);
        } catch (error) {
            const suffix = error instanceof CapabilityError ? ` (${error.code})` : "";
            this.notice(`${error instanceof Error ? error.message : "Request failed"}${suffix}`, true);
        } finally {
            this.setBusy(false);
            this.busy = false;
        }
    }

    private setBusy(busy: boolean): void {
        this.required("[part=workspace]").setAttribute("aria-busy", String(busy));
        for (const control of this.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")) {
            control.disabled = busy;
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
            throw new Error(`Missing settings element: ${selector}`);
        }
        return element;
    }
}

function tags(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function setTags(input: HTMLInputElement, values: string[]): void {
    input.value = values.join(",");
    input.setAttribute("value", input.value);
}
