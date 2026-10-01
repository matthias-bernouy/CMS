import { showToast } from "@bernouy/components";
import BubblesEvent from "cms-control/core/dom/BubblesEvent";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export class UserAdmin extends HTMLElement {
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
        const role = document.createElement("p9r-tag");
        role.textContent = enabled ? "Administrator" : "Member";
        if (this.getAttribute("editable") !== "true") {
            this.replaceChildren(role);
            return;
        }
        const button = document.createElement("p9r-button") as HTMLElement & { disabled: boolean };
        button.setAttribute("type", "button");
        button.setAttribute("variant", "outlined");
        button.textContent = enabled ? "Remove admin" : "Make admin";
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            button.disabled = true;
            const response = await fetch(`${getMetaBasePath()}/api/users/admin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sub, enabled: !enabled }),
            }).catch(() => null);
            if (response?.ok) {
                this.setAttribute("enabled", String(!enabled));
                document.dispatchEvent(new BubblesEvent(this.getAttribute("emit") ?? "user:updated"));
                showToast(!enabled ? "Administrator access granted" : "Administrator access removed", {
                    type: "success",
                });
                return;
            }
            showToast(await errorMessage(response), { type: "error" });
            button.disabled = false;
        });
        const actions = document.createElement("p9r-stack");
        actions.setAttribute("direction", "row");
        actions.setAttribute("align-items", "center");
        actions.setAttribute("gap", "sm");
        actions.append(role, button);
        this.replaceChildren(actions);
    }
}

async function errorMessage(response: Response | null): Promise<string> {
    if (!response) {
        return "Administrator access could not be changed because the CMS is unavailable.";
    }
    const payload = (await response.json().catch(() => null)) as { error?: string | { message?: string } } | null;
    const detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    return detail ?? `Administrator access could not be changed (${response.status}).`;
}

if (!customElements.get("cms-user-admin")) {
    customElements.define("cms-user-admin", UserAdmin);
}
