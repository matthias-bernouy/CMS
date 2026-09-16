import { renderLanguageSettings } from "./render";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class CmsLanguageSettings extends HTMLElement {
    static readonly observedAttributes = ["default-language", "additional-languages"];

    private defaultLanguage = "";
    private additionalLanguages = new Set<string>();
    private initialized = false;

    connectedCallback(): void {
        if (!this.initialized) {
            this.innerHTML = `<style>${css as unknown as string}</style>${template as unknown as string}`;
            this.initialized = true;
        }
        this.addEventListener("click", this.onClick);
        this.readSettings();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.onClick);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.readSettings();
        }
    }

    private readSettings(): void {
        this.defaultLanguage = this.getAttribute("default-language")?.trim() ?? "";
        this.additionalLanguages = new Set(
            readAdditionalLanguages(this.getAttribute("additional-languages")).filter(
                (code) => code.toLowerCase() !== this.defaultLanguage.toLowerCase(),
            ),
        );
        this.render();
        this.syncForm(false);
    }

    private readonly onClick = (event: Event): void => {
        const target = event.target;
        const button =
            target instanceof Element ? target.closest<HTMLElement>("p9r-button[data-language-action]") : null;
        if (!button || !this.contains(button)) {
            return;
        }
        const code = button.dataset.languageCode ?? "";
        if (!code) {
            return;
        }
        switch (button.dataset.languageAction) {
            case "add":
                if (this.defaultLanguage) {
                    this.additionalLanguages.add(code);
                } else {
                    this.defaultLanguage = code;
                }
                break;
            case "remove":
                this.additionalLanguages.delete(code);
                break;
            case "default":
                this.additionalLanguages.delete(code);
                if (this.defaultLanguage) {
                    this.additionalLanguages.add(this.defaultLanguage);
                }
                this.defaultLanguage = code;
                break;
            default:
                return;
        }
        this.render();
        this.syncForm(true);
    };

    private render(): void {
        renderLanguageSettings(this, {
            defaultLanguage: this.defaultLanguage,
            additionalLanguages: this.additionalLanguages,
        });
    }

    private syncForm(markDirty: boolean): void {
        const form = this.closest("form");
        const defaultInput = form?.querySelector<HTMLInputElement>('input[name="site.language"]');
        const additionalInput = form?.querySelector<HTMLInputElement>('input[name="site.additionalLanguages"]');
        if (!defaultInput || !additionalInput) {
            return;
        }
        defaultInput.value = this.defaultLanguage;
        additionalInput.value = [...this.additionalLanguages].join("\n");
        if (markDirty) {
            defaultInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
}

function readAdditionalLanguages(raw: string | null): string[] {
    try {
        const parsed: unknown = JSON.parse(raw ?? "[]");
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string" && !!value.trim())
            : [];
    } catch {
        return [];
    }
}

if (!customElements.get("cms-language-settings")) {
    customElements.define("cms-language-settings", CmsLanguageSettings);
}
