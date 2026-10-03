import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type Part = "hours" | "minutes" | "seconds";
const PART_CONFIG: Record<Part, { label: string; short: string; maximum: number }> = {
    hours: { label: "Hours", short: "h", maximum: 23 },
    minutes: { label: "Minutes", short: "min", maximum: 59 },
    seconds: { label: "Seconds", short: "sec", maximum: 59 },
};

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Time"
    );
}

export class Bloc extends Component {
    private source: HTMLInputElement | null = null;
    private container: HTMLElement;
    private inputs = new Map<Part, HTMLInputElement>();
    private sourceTabIndex: string | null = null;
    private sourceAriaHidden: string | null = null;
    private sourceHidden = false;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["parts"];
    }

    constructor() {
        super({ css, template });
        const container = this.shadowRoot?.querySelector<HTMLElement>('[part="parts"]');
        if (!container) {
            throw new Error("Missing time parts container");
        }
        this.container = container;
    }

    override connectedCallback(): void {
        this.bindSource();
    }

    disconnectedCallback(): void {
        this.source?.removeEventListener("input", this.sync);
        this.source?.removeEventListener("change", this.sync);
        this.source?.removeEventListener("focus", this.redirectFocus);
        this.source?.removeEventListener("click", this.redirectFromClick);
        this.observer.disconnect();
        this.restoreSource();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
            this.sync();
        }
    }

    private configuredParts(): Part[] {
        switch (this.getAttribute("parts")) {
            case "hours":
                return ["hours"];
            case "minutes":
                return ["minutes"];
            case "hours-minutes-seconds":
                return ["hours", "minutes", "seconds"];
            default:
                return ["hours", "minutes"];
        }
    }

    private bindSource(): void {
        this.source = this.querySelector<HTMLInputElement>('input[type="text"]');
        if (!this.source) {
            return;
        }
        this.sourceTabIndex = this.source.getAttribute("tabindex");
        this.sourceAriaHidden = this.source.getAttribute("aria-hidden");
        this.sourceHidden = this.source.hidden;
        this.source.hidden = true;
        this.source.setAttribute("aria-hidden", "true");
        this.source.tabIndex = -1;
        this.source.addEventListener("input", this.sync);
        this.source.addEventListener("change", this.sync);
        this.source.addEventListener("focus", this.redirectFocus);
        this.source.addEventListener("click", this.redirectFromClick);
        this.observer.observe(this.source, {
            attributes: true,
            attributeFilter: ["value", "disabled", "aria-invalid"],
        });
        this.render();
        this.toggleAttribute("data-ready", true);
        this.sync();
    }

    private render(): void {
        this.inputs.clear();
        const parts = this.configuredParts();
        const nodes: HTMLElement[] = [];
        parts.forEach((part, index) => {
            if (index) {
                const separator = document.createElement("span");
                separator.setAttribute("part", "separator");
                separator.setAttribute("aria-hidden", "true");
                separator.textContent = ":";
                nodes.push(separator);
            }
            const wrapper = document.createElement("label");
            wrapper.setAttribute("part", "time-part");
            const input = document.createElement("input");
            input.type = "number";
            input.inputMode = "numeric";
            input.min = "0";
            input.max = String(PART_CONFIG[part].maximum);
            input.step = "1";
            input.placeholder = "00";
            input.setAttribute("part", "part-input");
            input.addEventListener("input", this.updateSource);
            input.addEventListener("change", this.commitSource);
            const unit = document.createElement("span");
            unit.setAttribute("part", "unit");
            unit.textContent = PART_CONFIG[part].short;
            wrapper.append(input, unit);
            nodes.push(wrapper);
            this.inputs.set(part, input);
        });
        this.container.replaceChildren(...nodes);
    }

    private sync = (): void => {
        if (!this.source) {
            return;
        }
        const values = this.source.value.split(":");
        this.configuredParts().forEach((part, index) => {
            const input = this.inputs.get(part);
            if (!input) {
                return;
            }
            input.value = values[index] ?? "";
            input.disabled = this.source?.disabled === true;
            input.required = this.source?.required === true;
            input.setAttribute(
                "aria-label",
                `${labelFor(this.source as HTMLInputElement)} ${PART_CONFIG[part].label.toLowerCase()}`,
            );
        });
        this.container.setAttribute("aria-label", labelFor(this.source));
        this.toggleAttribute("data-disabled", this.source.disabled);
        this.toggleAttribute("data-invalid", this.source.getAttribute("aria-invalid") === "true");
    };

    private updateSource = (): void => this.writeSource(false);
    private commitSource = (): void => this.writeSource(true);

    private redirectFocus = (): void => {
        const firstInput = this.inputs.values().next().value;
        firstInput?.focus();
    };

    private redirectFromClick = (event: Event): void => {
        event.preventDefault();
        this.redirectFocus();
    };

    private writeSource(commit: boolean): void {
        if (!this.source) {
            return;
        }
        const values = this.configuredParts().map((part) => {
            const input = this.inputs.get(part);
            if (!input?.value) {
                return "";
            }
            const value = Math.min(PART_CONFIG[part].maximum, Math.max(0, Number(input.value)));
            if (commit) {
                input.value = String(value).padStart(2, "0");
            }
            return String(value).padStart(2, "0");
        });
        this.source.value = values.join(":");
        this.source.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        if (commit) {
            this.source.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
    }

    private restoreSource(): void {
        if (!this.source) {
            return;
        }
        this.source.hidden = this.sourceHidden;
        this.sourceTabIndex === null
            ? this.source.removeAttribute("tabindex")
            : this.source.setAttribute("tabindex", this.sourceTabIndex);
        this.sourceAriaHidden === null
            ? this.source.removeAttribute("aria-hidden")
            : this.source.setAttribute("aria-hidden", this.sourceAriaHidden);
    }
}
