/** Hosts the source workspace while the provider catalogue is being rebuilt. */
export class ResourceWorkspace extends HTMLElement {
    connectedCallback(): void {
        if (!this.querySelector(":scope > style")) {
            const style = document.createElement("style");
            style.textContent =
                "cms-resource-workspace { display: block; } cms-resource-workspace > [hidden] { display: none !important; }";
            this.prepend(style);
        }
        for (const child of Array.from(this.children)) {
            if (child instanceof HTMLElement) {
                child.hidden = false;
            }
        }
    }
}
if (!customElements.get("cms-resource-workspace")) {
    customElements.define("cms-resource-workspace", ResourceWorkspace);
}
