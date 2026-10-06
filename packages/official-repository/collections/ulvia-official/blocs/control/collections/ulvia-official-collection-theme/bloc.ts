import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { themeCapability } from "./runtime/client";
import { profileFor, sourceFor, type ThemeDocument, type ThemeMode, type ThemeSettings } from "./runtime/model";
import { renderTheme, required, type ThemeSelection } from "./runtime/render";
import { initializeThemeWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    static observedAttributes = ["collection-id"];
    private document: ThemeDocument | null = null;
    private settings: ThemeSettings | null = null;
    private selection: ThemeSelection = { collectionId: "", profileId: "", mode: "light", tokenId: "" };
    private busy = false;

    constructor() {
        super({ css, template });
        initializeThemeWorkspace(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("change", this.handleChange);
        this.shadowRoot?.addEventListener("input", this.handleSearch);
        this.shadowRoot?.addEventListener("submit", this.handleSubmit);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("change", this.handleChange);
        this.shadowRoot?.removeEventListener("input", this.handleSearch);
        this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            void this.load();
        }
    }

    private async load(): Promise<void> {
        await this.run(async () => {
            this.selection.collectionId = this.getAttribute("collection-id") ?? "";
            this.document = await themeCapability("get-theme", {});
            this.settings = JSON.parse(this.document.themeJson) as ThemeSettings;
            this.selection.profileId = this.settings.activeThemeId || this.settings.themes[0]?.id || "";
            this.selection.tokenId =
                sourceFor(this.settings, this.selection.collectionId)?.categories[0]?.tokens[0]?.id ?? "";
            this.render();
        });
    }

    private readonly handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button || !this.settings) {
            return;
        }
        if (button.dataset.token) {
            this.selection.tokenId = button.dataset.token;
            this.render();
        } else if (button.dataset.mode) {
            this.selection.mode = button.dataset.mode as ThemeMode;
            this.render();
        } else if (button.dataset.action === "activate") {
            this.settings.activeThemeId = this.selection.profileId;
            void this.save("Theme activated.");
        } else if (button.dataset.action === "reset-token") {
            this.updateToken(null);
            void this.save("Token reset to its collection default.");
        }
    };

    private readonly handleChange = (event: Event): void => {
        if (event.target instanceof HTMLSelectElement && event.target.matches("[data-profile]")) {
            this.selection.profileId = event.target.value;
            this.render();
        }
    };

    private readonly handleSearch = (event: Event): void => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-search]")) {
            return;
        }
        const query = event.target.value.trim().toLowerCase();
        for (const button of this.shadowRoot!.querySelectorAll<HTMLElement>("[data-search-value]")) {
            button.hidden = Boolean(query) && !button.dataset.searchValue?.includes(query);
        }
    };

    private readonly handleSubmit = (event: Event): void => {
        if (!(event.target instanceof HTMLFormElement) || event.target.dataset.form !== "token") {
            return;
        }
        event.preventDefault();
        this.updateToken(required<HTMLInputElement>(this.shadowRoot!, "[data-token-value]").value.trim());
        void this.save("Theme value saved.");
    };

    private updateToken(value: string | null): void {
        if (!this.settings) {
            return;
        }
        const profile = profileFor(this.settings, this.selection.profileId);
        if (!profile) {
            return;
        }
        profile.values[this.selection.mode] ??= {};
        if (value === null) {
            delete profile.values[this.selection.mode][this.selection.tokenId];
        } else {
            profile.values[this.selection.mode][this.selection.tokenId] = value;
        }
    }

    private save(success: string): Promise<void> {
        return this.run(async () => {
            if (!this.document || !this.settings) {
                return;
            }
            this.document = await themeCapability("save-theme", {
                expectedRevision: this.document.revision,
                themeJson: JSON.stringify(this.settings),
            });
            this.settings = JSON.parse(this.document.themeJson) as ThemeSettings;
            this.render();
        }, success);
    }

    private render(): void {
        if (this.settings) {
            renderTheme(this.shadowRoot!, this.settings, this.selection);
        }
    }

    private async run(task: () => Promise<void>, success = ""): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.shadowRoot!.host.setAttribute("aria-busy", "true");
        this.notice("Loading theme…");
        try {
            await task();
            this.notice(success);
        } catch (error) {
            this.notice(error instanceof Error ? error.message : "Theme request failed.", true);
        } finally {
            this.shadowRoot!.host.setAttribute("aria-busy", "false");
            this.busy = false;
        }
    }

    private notice(message: string, error = false): void {
        const notice = required(this.shadowRoot!, "[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }
}
