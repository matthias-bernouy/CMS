export class UserAdmin extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["enabled"];
    }

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
        }
    }

    private render(): void {
        const enabled = this.getAttribute("enabled") === "true";
        const role = document.createElement("p9r-tag");
        role.textContent = enabled ? "Administrator" : "Member";
        this.replaceChildren(role);
    }
}

if (!customElements.get("cms-user-admin")) {
    customElements.define("cms-user-admin", UserAdmin);
}
