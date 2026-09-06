import "../Integrations/IntegrationBrowser";

/** Mounts the shared catalogue in the Sources or Blocs workspace. */
export class ResourceWorkspace extends HTMLElement {
    private browser?: HTMLElement;
    private observer?: MutationObserver;
    connectedCallback(): void {
        if (!this.querySelector(":scope > style")) {
            const style = document.createElement("style");
            style.textContent =
                "cms-resource-workspace { display: block; } cms-resource-workspace > [hidden] { display: none !important; }";
            this.prepend(style);
        }
        window.addEventListener("popstate", this.sync);
        window.addEventListener("cms-resources:route", this.sync);
        window.addEventListener("cms-dashboards:selection", this.sync);
        this.observer = new MutationObserver(this.sync);
        this.observer.observe(this, { childList: true });
        this.sync();
    }
    disconnectedCallback(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        window.removeEventListener("popstate", this.sync);
        window.removeEventListener("cms-resources:route", this.sync);
        window.removeEventListener("cms-dashboards:selection", this.sync);
    }
    private sync = (): void => {
        const params = new URL(window.location.href).searchParams;
        const catalogue = params.has("integration") || params.has("setup") || params.has("tab");
        if (catalogue && !this.browser) {
            this.browser = document.createElement("cms-integrations-admin");
            this.append(this.browser);
        }
        for (const child of Array.from(this.children)) {
            if (child instanceof HTMLElement) {
                child.hidden = (child === this.browser) !== catalogue;
            }
        }
    };
}
if (!customElements.get("cms-resource-workspace")) {
    customElements.define("cms-resource-workspace", ResourceWorkspace);
}
