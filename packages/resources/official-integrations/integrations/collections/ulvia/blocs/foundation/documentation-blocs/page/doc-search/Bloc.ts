import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class Bloc extends Component {
    active = -1;
    input = null;
    placeholderSlot = null;
    results = null;

    constructor() {
        super({ css, template });
        this.input = this.shadowRoot?.querySelector(".input") ?? null;
        this.placeholderSlot = this.shadowRoot?.querySelector('slot[name="placeholder"]') ?? null;
        this.results = this.shadowRoot?.querySelector(".results") ?? null;
    }

    connectedCallback() {
        this.placeholderSlot?.addEventListener("slotchange", this.syncPlaceholder);
        this.input?.addEventListener("input", this.onInput);
        this.input?.addEventListener("focus", this.renderResults);
        this.input?.addEventListener("keydown", this.onInputKeydown);
        document.addEventListener("click", this.onDocumentClick);
        window.addEventListener("keydown", this.onShortcut);
        this.syncPlaceholder();
    }

    disconnectedCallback() {
        this.placeholderSlot?.removeEventListener("slotchange", this.syncPlaceholder);
        this.input?.removeEventListener("input", this.onInput);
        this.input?.removeEventListener("focus", this.renderResults);
        this.input?.removeEventListener("keydown", this.onInputKeydown);
        document.removeEventListener("click", this.onDocumentClick);
        window.removeEventListener("keydown", this.onShortcut);
    }

    entries() {
        const root = this.closest("doc-layout") ?? document;
        return [...root.querySelectorAll('[slot="sidebar"] a[href]')].map((anchor) => ({
            href: anchor.href,
            label: anchor.textContent?.trim() || anchor.pathname,
            section:
                anchor.closest("doc-sidebar-section")?.querySelector('[slot="title"]')?.textContent?.trim() ||
                "Documentation",
        }));
    }

    syncPlaceholder = () => {
        if (!this.input) {
            return;
        }
        const text = this.placeholderSlot
            ?.assignedNodes({ flatten: true })
            .map((node) => node.textContent ?? "")
            .join("")
            .trim();
        this.input.placeholder = text || "Search documentation…";
    };

    onInput = () => {
        this.dispatchEvent(
            new CustomEvent("doc-search", {
                detail: { value: this.input?.value ?? "" },
                bubbles: true,
                composed: true,
            }),
        );
        this.renderResults();
    };

    renderResults = () => {
        if (!this.results || !this.input) {
            return;
        }
        const query = this.input.value.trim().toLocaleLowerCase();
        const matches = this.entries()
            .filter((entry) => `${entry.label} ${entry.section}`.toLocaleLowerCase().includes(query))
            .slice(0, 8);
        this.active = -1;
        this.results.replaceChildren(...matches.map((entry, index) => this.result(entry, index)));
        this.results.toggleAttribute("data-empty", matches.length === 0);
        this.results.setAttribute("data-open", "");
        this.input.setAttribute("aria-expanded", "true");
    };

    result(entry, index) {
        const link = document.createElement("a");
        link.href = entry.href;
        link.id = `doc-search-option-${index}`;
        link.role = "option";
        link.innerHTML = `<strong></strong><span></span>`;
        const strong = link.querySelector("strong");
        const span = link.querySelector("span");
        if (strong) {
            strong.textContent = entry.label;
        }
        if (span) {
            span.textContent = entry.section;
        }
        return link;
    }

    onInputKeydown = (event) => {
        const options = [...(this.results?.querySelectorAll('a[role="option"]') ?? [])];
        if (event.key === "Escape") {
            this.close();
            this.input?.blur();
            return;
        }
        if (event.key === "Enter" && this.active >= 0) {
            options[this.active]?.click();
            return;
        }
        if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || options.length === 0) {
            return;
        }
        event.preventDefault();
        if (this.active < 0) {
            this.active = event.key === "ArrowDown" ? 0 : options.length - 1;
        } else {
            this.active = (this.active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        }
        options.forEach((option, index) => option.setAttribute("aria-selected", String(index === this.active)));
        this.input?.setAttribute("aria-activedescendant", options[this.active]?.id ?? "");
    };

    onShortcut = (event) => {
        if (
            this.getAttribute("shortcut") === "true" &&
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "k"
        ) {
            event.preventDefault();
            this.input?.focus();
        }
    };

    onDocumentClick = (event) => {
        if (!event.composedPath().includes(this)) {
            this.close();
        }
    };

    close() {
        this.results?.removeAttribute("data-open");
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
