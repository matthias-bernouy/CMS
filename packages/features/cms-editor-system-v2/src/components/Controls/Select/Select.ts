import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

type SelectOption = {
    label: string;
    value: string;
};

export class Select extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".label")!.textContent = this.getAttribute("label") ?? "";
        this.shadowRoot!.querySelector(".hint")!.textContent = this.getAttribute("hint") ?? "";
        const current = this.getAttribute("value");
        const options = this._parseOptions();
        this.shadowRoot!.querySelector("select")!.replaceChildren(...options.map((option) => {
            const element = document.createElement("option");
            element.textContent = option.label;
            element.value = option.value;
            element.selected = option.value === current;
            return element;
        }));
    }

    private _parseOptions(): SelectOption[] {
        const raw = this.getAttribute("options") ?? "";
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((item): item is SelectOption => {
                        return Boolean(item)
                            && typeof item === "object"
                            && typeof (item as SelectOption).label === "string"
                            && typeof (item as SelectOption).value === "string";
                    });
            }
        } catch {
            // Fall through to the legacy comma-separated format.
        }

        return raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => ({ label: item, value: item }));
    }
}

if (!customElements.get("cms-editor-v2-select")) {
    customElements.define("cms-editor-v2-select", Select);
}
