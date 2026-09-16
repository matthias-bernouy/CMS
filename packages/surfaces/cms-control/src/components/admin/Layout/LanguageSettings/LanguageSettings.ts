import { renderLanguageSettings } from "./render";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class CmsLanguageSettings extends HTMLElement {
    static readonly observedAttributes = ["default-language", "additional-languages", "active-languages"];

    private defaultLanguage = "";
    private additionalLanguages = new Set<string>();
    private activeLanguages = new Set<string>();
    private initialized = false;

    connectedCallback(): void {
        if (!this.initialized) {
            this.innerHTML = `<style>${css as unknown as string}</style>${template as unknown as string}`;
            this.initialized = true;
        }
        this.addEventListener("click", this.onClick);
        this.addEventListener("change", this.onChange);
        this.readSettings();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("change", this.onChange);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.readSettings();
        }
    }

    private readSettings(): void {
        this.defaultLanguage = this.getAttribute("default-language")?.trim() ?? "";
        this.additionalLanguages = new Set(
            readLanguages(this.getAttribute("additional-languages")).filter(
                (code) => code.toLowerCase() !== this.defaultLanguage.toLowerCase(),
            ),
        );
        const activeCodes = new Set(
            readLanguages(this.getAttribute("active-languages")).map((code) => code.toLowerCase()),
        );
        this.activeLanguages = new Set(
            [...this.additionalLanguages].filter((code) => activeCodes.has(code.toLowerCase())),
        );
        this.render();
        this.syncForm(false);
    }

    private readonly onChange = (event: Event): void => {
        const target = event.target;
        if (target instanceof HTMLElement && target.matches("p9r-select[data-default-select]")) {
            const code = (target as HTMLElement & { value: string }).value;
            if (code !== this.defaultLanguage && this.additionalLanguages.has(code)) {
                this.additionalLanguages.delete(code);
                this.activeLanguages.delete(code);
                if (this.defaultLanguage) {
                    this.additionalLanguages.add(this.defaultLanguage);
                    this.activeLanguages.add(this.defaultLanguage);
                }
                this.defaultLanguage = code;
                this.render();
                this.syncForm(true);
            }
            return;
        }
        if (!(target instanceof HTMLElement) || target.localName !== "w13c-switch" || !this.contains(target)) {
            return;
        }
        const code = target.dataset.languageCode ?? "";
        if (!this.additionalLanguages.has(code)) {
            return;
        }
        if (target.hasAttribute("checked")) {
            this.activeLanguages.add(code);
        } else {
            this.activeLanguages.delete(code);
        }
        this.render();
        this.syncForm(true);
    };

    private readonly onClick = (event: Event): void => {
        const target = event.target;
        const button = target instanceof Element ? target.closest<HTMLElement>("[data-language-action]") : null;
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
                this.activeLanguages.delete(code);
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
            activeLanguages: this.activeLanguages,
        });
    }

    private syncForm(markDirty: boolean): void {
        const form = this.closest("form");
        const defaultInput = form?.querySelector<HTMLInputElement>('input[name="site.language"]');
        const additionalInput = form?.querySelector<HTMLInputElement>('input[name="site.additionalLanguages"]');
        const activeInput = form?.querySelector<HTMLInputElement>('input[name="site.activeLanguages"]');
        if (!defaultInput || !additionalInput || !activeInput) {
            return;
        }
        defaultInput.value = this.defaultLanguage;
        additionalInput.value = [...this.additionalLanguages].join("\n");
        activeInput.value = [...this.activeLanguages].join("\n");
        if (markDirty) {
            defaultInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
}

function readLanguages(raw: string | null): string[] {
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
