import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

class UserAdmin extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["sub", "enabled", "editable"];
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
        const sub = this.getAttribute("sub");
        if (!sub) {
            return;
        }
        const enabled = this.getAttribute("enabled") === "true";
        const button = document.createElement("p9r-button") as HTMLElement & { disabled: boolean };
        button.setAttribute("type", "button");
        button.setAttribute("variant", "outlined");
        button.textContent = enabled ? "Remove admin" : "Make admin";
        const role = document.createElement("strong");
        role.textContent = enabled ? "Administrator" : "Member";
        if (this.getAttribute("editable") !== "true") {
            this.replaceChildren(role);
            return;
        }
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            button.disabled = true;
            const response = await fetch(`${getMetaBasePath()}/api/users/admin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sub, enabled: !enabled }),
            });
            if (response.ok) {
                location.reload();
                return;
            }
            const error = document.createElement("span");
            error.setAttribute("role", "alert");
            error.textContent = `Could not change access (${response.status}).`;
            this.append(error);
            button.disabled = false;
        });
        this.replaceChildren(role, document.createTextNode(" "), button);
    }
}

customElements.define("cms-user-admin", UserAdmin);
