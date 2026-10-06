import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextHintId = 0;

export class Bloc extends Component {
    private source: HTMLInputElement | null = null;
    private input: HTMLInputElement | null;
    private tagsContainer: HTMLElement | null;
    private hint: HTMLElement | null;
    private status: HTMLElement | null;
    private root: Document | ShadowRoot | null = null;
    private sourceAriaHidden: string | null = null;
    private sourceTabIndex: string | null = null;
    private sourcePrepared = false;
    private tags: string[] = [];
    private observer = new MutationObserver(() => this.syncState());

    static get observedAttributes(): string[] {
        return ["placeholder", "hint", "separator", "max-tags", "add-on-blur"];
    }

    constructor() {
        super({ css, template });
        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.autocomplete = "off";
        this.input.setAttribute("part", "input");
        this.shadowRoot?.querySelector('[part="draft"]')?.append(this.input);
        this.tagsContainer = this.shadowRoot?.querySelector('[part="tags"]') ?? null;
        this.hint = this.shadowRoot?.querySelector('[part="hint"]') ?? null;
        this.status = this.shadowRoot?.querySelector('[part="status"]') ?? null;
    }

    override connectedCallback(): void {
        this.source = this.querySelector<HTMLInputElement>(":scope > input");
        this.hideSourceFromAccessibilityTree();
        this.tags = this.parseTags(this.source?.value ?? "");
        this.input?.addEventListener("keydown", this.handleKeydown);
        this.input?.addEventListener("blur", this.handleBlur);
        this.source?.addEventListener("focus", this.redirectFocus);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.handleReset);
        this.shadowRoot?.querySelector('[part="control"]')?.addEventListener("click", this.focusInput);
        this.tagsContainer?.addEventListener("click", this.removeTag);
        if (this.source) {
            this.observer.observe(this.source, { attributes: true, attributeFilter: ["disabled", "value"] });
        }
        this.syncState();
        this.render();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("keydown", this.handleKeydown);
        this.input?.removeEventListener("blur", this.handleBlur);
        this.source?.removeEventListener("focus", this.redirectFocus);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.shadowRoot?.querySelector('[part="control"]')?.removeEventListener("click", this.focusInput);
        this.tagsContainer?.removeEventListener("click", this.removeTag);
        this.observer.disconnect();
        this.restoreSourceAccessibility();
    }

    attributeChangedCallback(): void {
        this.syncState();
    }

    private handleKeydown = (event: KeyboardEvent): void => {
        const separator = this.separator();
        if (event.key === "Enter" || event.key === separator) {
            event.preventDefault();
            this.addTag(this.input?.value ?? "");
        } else if (event.key === "Backspace" && !this.input?.value && this.tags.length) {
            this.removeAt(this.tags.length - 1);
        }
    };

    private handleBlur = (): void => {
        const addOnBlur = this.getAttribute("add-on-blur");
        if (addOnBlur === "" || addOnBlur === "true") {
            this.addTag(this.input?.value ?? "");
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.source?.form) {
            return;
        }
        window.setTimeout(() => {
            this.tags = this.parseTags(this.source?.value ?? "");
            if (this.input) {
                this.input.value = "";
            }
            this.render();
        });
    };

    private addTag(rawValue: string): void {
        const value = rawValue.trim();
        if (!value || this.source?.disabled) {
            return;
        }
        const maximum = Number(this.getAttribute("max-tags") || "20");
        if (
            this.tags.length >= maximum ||
            this.tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())
        ) {
            this.announce(
                this.tags.length >= maximum ? `Maximum of ${maximum} tags reached` : `${value} is already added`,
            );
            return;
        }
        this.tags.push(value);
        if (this.input) {
            this.input.value = "";
        }
        this.commit();
        this.announce(`${value} added`);
    }

    private removeTag = (event: Event): void => {
        const button =
            event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-index]") : null;
        if (button) {
            this.removeAt(Number(button.dataset.index));
        }
    };

    private removeAt(index: number): void {
        const removed = this.tags.splice(index, 1).at(0);
        if (!removed) {
            return;
        }
        this.commit();
        this.announce(`${removed} removed`);
        this.input?.focus();
    }

    private commit(): void {
        if (this.source) {
            this.source.value = this.tags.join(this.separator());
            this.source.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            this.source.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
        this.render();
    }

    private render(): void {
        this.tagsContainer?.replaceChildren(
            ...this.tags.map((tag, index) => {
                const item = document.createElement("span");
                item.setAttribute("part", "tag");
                item.setAttribute("role", "listitem");
                const text = document.createElement("span");
                text.textContent = tag;
                const remove = document.createElement("button");
                remove.type = "button";
                remove.dataset.index = String(index);
                remove.setAttribute("part", "remove");
                remove.setAttribute("aria-label", `Remove ${tag}`);
                remove.disabled = this.source?.disabled === true;
                item.append(text, remove);
                return item;
            }),
        );
        this.tagsContainer?.toggleAttribute("hidden", this.tags.length === 0);
    }

    private syncState(): void {
        if (this.input) {
            this.input.placeholder = this.getAttribute("placeholder") || "Type and press Enter";
            this.input.disabled = this.source?.disabled === true;
            this.input.setAttribute("aria-label", this.accessibleName());
        }
        if (this.hint) {
            this.hint.id ||= `ulvia-tag-hint-${++nextHintId}`;
            this.hint.textContent = this.getAttribute("hint") || "Press Enter to add. Backspace removes the last tag.";
            this.input?.setAttribute("aria-describedby", this.hint.id);
        }
        this.toggleAttribute("data-disabled", this.source?.disabled === true);
        this.render();
    }

    private separator(): string {
        return this.getAttribute("separator")?.charAt(0) || ",";
    }

    private parseTags(value: string): string[] {
        return value
            .split(this.separator())
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    private announce(message: string): void {
        if (this.status) {
            this.status.textContent = message;
        }
    }

    private redirectFocus = (): void => {
        this.input?.focus();
    };

    private focusInput = (event: Event): void => {
        if (!(event.target instanceof HTMLButtonElement)) {
            this.input?.focus();
        }
    };

    private accessibleName(): string {
        return (
            this.source?.getAttribute("aria-label")?.trim() ||
            this.source?.labels?.item(0)?.textContent?.trim() ||
            this.getAttribute("placeholder") ||
            "Add a tag"
        );
    }

    private hideSourceFromAccessibilityTree(): void {
        if (!this.source || this.sourcePrepared) {
            return;
        }
        this.sourceAriaHidden = this.source.getAttribute("aria-hidden");
        this.sourceTabIndex = this.source.getAttribute("tabindex");
        this.source.setAttribute("aria-hidden", "true");
        this.source.tabIndex = -1;
        this.sourcePrepared = true;
    }

    private restoreSourceAccessibility(): void {
        if (!this.source || !this.sourcePrepared) {
            return;
        }
        if (this.sourceAriaHidden === null) {
            this.source.removeAttribute("aria-hidden");
        } else {
            this.source.setAttribute("aria-hidden", this.sourceAriaHidden);
        }
        if (this.sourceTabIndex === null) {
            this.source.removeAttribute("tabindex");
        } else {
            this.source.setAttribute("tabindex", this.sourceTabIndex);
        }
        this.sourcePrepared = false;
    }
}
