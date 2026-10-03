import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextControlId = 0;

export class Bloc extends Component {
    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        const control = this.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea",
        );
        const label = this.querySelector<HTMLLabelElement>('label[slot="field-label"]');
        if (!control || !label) {
            return;
        }
        control.id ||= `ulvia-field-control-${++nextControlId}`;
        label.htmlFor = control.id;
        this.connectDescription(control, "field-description");
        this.connectDescription(control, "field-error");
    }

    private connectDescription(
        control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
        slotName: string,
    ): void {
        const description = this.querySelector<HTMLElement>(`[slot="${slotName}"]`);
        if (!description?.textContent?.trim()) {
            return;
        }
        description.id ||= `${control.id}-${slotName}`;
        const references = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
        references.add(description.id);
        control.setAttribute("aria-describedby", Array.from(references).join(" "));
    }
}
