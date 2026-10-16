import { BlocBehavior } from "@bernouy/cms-content/browser";

let nextControlId = 0;

export class Bloc extends BlocBehavior {
    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        const control = this.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea",
        );
        const label = this.querySelector<HTMLLabelElement>('label[part~="field-label"]');
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
        const description = this.querySelector<HTMLElement>(`[part~="${slotName}"]`);
        if (!description?.textContent?.trim()) {
            return;
        }
        description.id ||= `${control.id}-${slotName}`;
        const references = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
        references.add(description.id);
        control.setAttribute("aria-describedby", Array.from(references).join(" "));
    }
}
