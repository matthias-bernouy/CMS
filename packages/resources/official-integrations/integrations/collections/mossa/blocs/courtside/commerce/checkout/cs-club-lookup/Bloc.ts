import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type ClubOption = {
    value: string;
    label: string;
};

type ValueControl = HTMLElement & {
    value?: string;
};

export class Bloc extends Component {
    static observedAttributes = ["field-id", "label", "name", "placeholder", "required", "source-url", "value"];

    private options: ClubOption[] = [];
    private visibleOptions: ClubOption[] = [];
    private selectedValue = "";
    private selectedLabel = "";
    private activeIndex = -1;
    private loaded = false;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.ensureValueInput();
        if (!this.results.id) {
            this.results.id = `club-lookup-${crypto.randomUUID()}`;
        }
        this.nativeSearch?.setAttribute("role", "combobox");
        this.nativeSearch?.setAttribute("aria-autocomplete", "list");
        this.nativeSearch?.setAttribute("aria-controls", this.results.id);
        this.nativeSearch?.setAttribute("aria-expanded", "false");
        this.search.addEventListener("input", this.onInput);
        this.search.addEventListener("change", this.onSearchChange);
        this.search.addEventListener("focus", this.renderResults);
        this.search.addEventListener("keydown", this.onKeyDown, true);
        this.lookup.addEventListener("focusout", this.onFocusOut);
        this.syncAttributes();
        void this.loadOptions();
    }

    disconnectedCallback(): void {
        this.search.removeEventListener("input", this.onInput);
        this.search.removeEventListener("change", this.onSearchChange);
        this.search.removeEventListener("focus", this.renderResults);
        this.search.removeEventListener("keydown", this.onKeyDown, true);
        this.lookup.removeEventListener("focusout", this.onFocusOut);
    }

    attributeChangedCallback(name: string, previous: string | null, current: string | null): void {
        if (!this.isConnected || previous === current) {
            return;
        }
        if (name === "field-id" || name === "source-url") {
            void this.loadOptions();
            return;
        }
        this.syncAttributes();
    }

    private async loadOptions(): Promise<void> {
        this.setStatus("Chargement des clubs…");
        try {
            const response = await fetch(
                this.getAttribute("source-url") || "/.cms/sources/commerce/entityCustomFields?entityType=order",
                { credentials: "include", headers: { accept: "application/json" } },
            );
            const body = (await response.json().catch(() => null)) as {
                fields?: Array<{
                    id?: unknown;
                    label?: unknown;
                    options?: unknown[];
                    selfEditable?: unknown;
                }>;
                error?: unknown;
            } | null;
            if (!response.ok) {
                throw new Error(String(body?.error || response.status));
            }

            const fieldId = this.getAttribute("field-id")?.trim() || "club";
            const field = body?.fields?.find(
                (candidate) => candidate.selfEditable === true && String(candidate.id || "") === fieldId,
            );
            if (!field) {
                this.options = [];
                this.loaded = true;
                this.setStatus(`Le champ « ${fieldId} » n'est pas configuré dans Commerce.`);
                return;
            }

            this.options = normalizeOptions(field.options);
            this.loaded = true;
            if (!this.hasAttribute("label") && typeof field.label === "string") {
                this.search.setAttribute("label", field.label);
                this.results.setAttribute("aria-label", field.label);
            }
            this.applyValue(this.getAttribute("value") || "");
            this.setStatus(this.options.length ? "" : "Aucun club disponible pour le moment.");
        } catch {
            this.loaded = false;
            this.options = [];
            this.setStatus("Impossible de charger les clubs. Réessaie dans quelques instants.");
        }
    }

    private syncAttributes(): void {
        const label = this.getAttribute("label") || "Club";
        this.search.setAttribute("label", label);
        this.results.setAttribute("aria-label", label);
        this.search.setAttribute("placeholder", this.getAttribute("placeholder") || "Rechercher un club…");
        if (this.hasAttribute("required")) {
            this.search.setAttribute("required", "");
        } else {
            this.search.removeAttribute("required");
        }

        this.valueInput.name = this.getAttribute("name") || "club";
        if (this.loaded) {
            this.applyValue(this.getAttribute("value") || "");
        } else {
            this.selectedValue = this.getAttribute("value") || "";
            this.valueInput.value = this.selectedValue;
        }
    }

    private applyValue(value: string): void {
        const normalizedValue = String(value || "").trim();
        const option = this.options.find((candidate) => candidate.value === normalizedValue);
        this.selectedValue = normalizedValue;
        this.selectedLabel = option?.label || normalizedValue;
        this.valueInput.value = normalizedValue;
        this.search.value = this.selectedLabel;
    }

    private choose(option: ClubOption | null): void {
        const value = option?.value || "";
        const changed = value !== this.valueInput.value;
        this.selectedValue = value;
        this.selectedLabel = option?.label || "";
        this.valueInput.value = value;
        this.search.value = this.selectedLabel;
        this.close();
        if (changed) {
            this.valueInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    private onInput = (): void => {
        const query = String(this.search.value || "");
        if (query !== this.selectedLabel) {
            this.selectedValue = "";
            this.selectedLabel = "";
        }
        this.renderResults();
    };

    private onSearchChange = (event: Event): void => {
        event.stopPropagation();
    };

    private onKeyDown = (event: Event): void => {
        if (!(event instanceof KeyboardEvent)) {
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (this.results.hidden) {
                this.renderResults();
            }
            this.markActive(this.activeIndex + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (this.results.hidden) {
                this.renderResults();
            }
            this.markActive(this.activeIndex - 1);
        } else if (event.key === "Enter" && !this.results.hidden && this.activeIndex >= 0) {
            event.preventDefault();
            this.choose(this.visibleOptions[this.activeIndex]);
        } else if (event.key === "Escape" && !this.results.hidden) {
            event.preventDefault();
            this.restoreCommittedValue();
            this.close();
        }
    };

    private onFocusOut = (): void => {
        window.setTimeout(() => {
            const active = this.shadowRoot?.activeElement;
            if (active instanceof Node && this.lookup.contains(active)) {
                return;
            }

            const query = String(this.search.value || "").trim();
            const exact = this.options.find(
                (option) => normalizeLookupText(option.label) === normalizeLookupText(query),
            );
            if (exact) {
                this.choose(exact);
            } else if (!query) {
                this.choose(null);
            } else {
                this.restoreCommittedValue();
                this.close();
            }
        });
    };

    private renderResults = (): void => {
        if (!this.loaded) {
            return;
        }
        const query = normalizeLookupText(String(this.search.value || ""));
        this.visibleOptions = this.options.filter((option) => normalizeLookupText(option.label).includes(query));
        this.activeIndex = -1;

        if (!this.visibleOptions.length) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "Aucun club trouvé.";
            this.results.replaceChildren(empty);
        } else {
            this.results.replaceChildren(
                ...this.visibleOptions.map((option, index) => {
                    const button = document.createElement("button");
                    button.id = `${this.results.id}-${index}`;
                    button.type = "button";
                    button.setAttribute("role", "option");
                    button.setAttribute("aria-selected", "false");
                    button.textContent = option.label;
                    button.addEventListener("click", () => this.choose(option));
                    return button;
                }),
            );
        }
        this.results.hidden = false;
        this.nativeSearch?.setAttribute("aria-expanded", "true");
    };

    private markActive(index: number): void {
        const buttons = Array.from(this.results.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
        if (!buttons.length) {
            return;
        }
        this.activeIndex = (index + buttons.length) % buttons.length;
        buttons.forEach((button, buttonIndex) =>
            button.setAttribute("aria-selected", String(buttonIndex === this.activeIndex)),
        );
        const active = buttons[this.activeIndex];
        this.nativeSearch?.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
    }

    private restoreCommittedValue(): void {
        const option = this.options.find((candidate) => candidate.value === this.valueInput.value);
        this.selectedValue = this.valueInput.value;
        this.selectedLabel = option?.label || this.valueInput.value;
        this.search.value = this.selectedLabel;
    }

    private close(): void {
        this.results.hidden = true;
        this.activeIndex = -1;
        this.nativeSearch?.setAttribute("aria-expanded", "false");
        this.nativeSearch?.removeAttribute("aria-activedescendant");
    }

    private ensureValueInput(): HTMLInputElement {
        let input = this.querySelector<HTMLInputElement>("input[data-club-lookup-value]");
        if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.setAttribute("data-club-lookup-value", "");
            input.name = this.getAttribute("name") || "club";
            input.value = this.getAttribute("value") || "";
            this.append(input);
        }
        return input;
    }

    private setStatus(message: string): void {
        this.status.textContent = message;
    }

    private get lookup(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".lookup")!;
    }

    private get search(): ValueControl {
        return this.shadowRoot!.querySelector<ValueControl>("[data-search]")!;
    }

    private get nativeSearch(): HTMLInputElement | null {
        return this.search.shadowRoot?.querySelector<HTMLInputElement>("input") || null;
    }

    private get results(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-results]")!;
    }

    private get status(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-status]")!;
    }

    private get valueInput(): HTMLInputElement {
        return this.ensureValueInput();
    }
}

function normalizeOptions(options: unknown): ClubOption[] {
    if (!Array.isArray(options)) {
        return [];
    }
    return options
        .map((option) => {
            if (typeof option === "string") {
                return { value: option, label: option };
            }
            if (!option || typeof option !== "object" || Array.isArray(option)) {
                return null;
            }
            const record = option as Record<string, unknown>;
            const value = String(record.value ?? "");
            const label = String(record.label ?? value);
            return value && label ? { value, label } : null;
        })
        .filter((option): option is ClubOption => option !== null);
}

function normalizeLookupText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("fr-FR")
        .trim();
}
