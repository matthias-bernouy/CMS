import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    clearCompositionRuntimeState,
    compositionInput,
    ensureCompositionStyle,
} from "./compositionRuntime";

export type CompositionMetadata = {
    template: string;
};

/**
 * Transparent Light DOM composition host.
 *
 * Authored children are retained in an inert template for serialization but
 * are not rendered. Slot projection will decide which inputs render later.
 */
export abstract class Composition extends HTMLElement {
    private readonly templateSource: string;
    private input: HTMLTemplateElement | null = null;
    private rendered = false;

    constructor(metadata: CompositionMetadata) {
        super();
        this.templateSource = metadata.template;
    }

    connectedCallback(): void {
        ensureCompositionStyle(this);
        if (!this.rendered) {
            const snapshotInput = this.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)
                ? compositionInput(this)
                : null;
            this.input = snapshotInput ?? this.captureInput();
            this.setAttribute(COMPOSITION_RUNTIME_ATTRIBUTE, "");
            if (!snapshotInput) this.renderTemplate();
            this.rendered = true;
        }
    }

    private captureInput(): HTMLTemplateElement {
        const input = this.ownerDocument.createElement("template");
        input.setAttribute(COMPOSITION_INPUT_ATTRIBUTE, "");
        input.content.append(...Array.from(this.childNodes));
        clearCompositionRuntimeState(input.content);
        this.append(input);
        return input;
    }

    private renderTemplate(): void {
        const template = this.ownerDocument.createElement("template");
        template.innerHTML = this.templateSource;
        const output = this.ownerDocument.createElement("p9r-composition-output");
        output.setAttribute(COMPOSITION_OUTPUT_ATTRIBUTE, "");
        output.append(template.content.cloneNode(true));
        this.append(output);
    }
}
