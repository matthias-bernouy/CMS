import { Component } from "@bernouy/components/base";
import { showToast } from "@bernouy/components";
import BubblesEvent from "cms-control/core/dom/BubblesEvent";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

type Action = "password-reset" | "email-verification" | "mark-verified" | "delete";

const ACTIONS: Record<Action, { endpoint: string; label: string }> = {
    "password-reset": { endpoint: "/api/users/password-reset", label: "Password reset sent" },
    "email-verification": { endpoint: "/api/users/email-verification", label: "Verification email sent" },
    "mark-verified": { endpoint: "/api/users/email-verified", label: "Email marked verified" },
    "delete": { endpoint: "/api/users", label: "User deleted" },
};

export class CmsUserActions extends Component {
    static get observedAttributes(): string[] {
        return ["password-reset", "email-verification", "mark-verified"];
    }

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener("click", this.onClick);
        this.sync();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.onClick);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private onClick = (event: Event): void => {
        const item = event.composedPath().find(isActionItem);
        const action = item?.dataset.action as Action | undefined;
        if (!action || !ACTIONS[action]) {
            return;
        }
        event.preventDefault();
        void this.run(action);
    };

    private async run(action: Action): Promise<void> {
        const sub = this.getAttribute("sub") ?? "";
        if (!sub) {
            return;
        }
        if (
            action === "delete" &&
            !confirm(
                "Delete this user? Their account, local password and access tokens are removed. This cannot be undone.",
            )
        ) {
            return;
        }
        const res = await fetch(this.url(action), this.request(action, sub)).catch(() => null);
        if (!res?.ok) {
            showToast(await errorMessage(res), { type: "error" });
            return;
        }
        showToast(ACTIONS[action].label, { type: "success" });
        if (action === "delete") {
            window.location.href = `${this.basePath}/admin/users`;
        } else {
            document.dispatchEvent(new BubblesEvent(this.getAttribute("emit") ?? "user:updated"));
        }
    }

    private request(action: Action, sub: string): RequestInit {
        if (action === "delete") {
            return { method: "DELETE" };
        }
        return {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sub }),
        };
    }

    private url(action: Action): string {
        const endpoint = `${this.basePath}${ACTIONS[action].endpoint}`;
        if (action !== "delete") {
            return endpoint;
        }
        return `${endpoint}?sub=${this.getAttribute("sub-param") ?? encodeURIComponent(this.getAttribute("sub") ?? "")}`;
    }

    private get basePath(): string {
        return this.getAttribute("base-path") ?? "";
    }

    private sync(): void {
        for (const action of ["password-reset", "email-verification", "mark-verified"] as Action[]) {
            this.item(action)?.toggleAttribute("disabled", this.getAttribute(action) !== "true");
        }
    }

    private item(action: Action): HTMLElement | null {
        return this.shadowRoot?.querySelector<HTMLElement>(`[data-action="${action}"]`) ?? null;
    }
}

async function errorMessage(res: Response | null): Promise<string> {
    if (!res) {
        return "Network error";
    }
    const text = await res.text().catch(() => "");
    try {
        return JSON.parse(text)?.error ?? (text || `HTTP ${res.status}`);
    } catch {
        return text || `HTTP ${res.status}`;
    }
}

function isActionItem(target: EventTarget | undefined): target is HTMLElement {
    return target instanceof HTMLElement && target.tagName.toLowerCase() === "p9r-action-menu-item";
}

if (!customElements.get("cms-user-actions")) {
    customElements.define("cms-user-actions", CmsUserActions);
}
