/** Signals when a bound checkbox is ready to restore its unsaved local edit. */
export class BlocChoice extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["resource", "selected"];
    }

    connectedCallback(): void {
        this.notify();
    }

    attributeChangedCallback(): void {
        this.notify();
    }

    private notify(): void {
        queueMicrotask(() => {
            if (this.isConnected) {
                this.dispatchEvent(new Event("bloc:choice-ready", { bubbles: true }));
            }
        });
    }
}

customElements.define("cms-bloc-choice", BlocChoice);
