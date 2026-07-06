class UserAccountForm extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.account = null;
    }

    connectedCallback() {
        this.render();
        this.form.addEventListener("submit", event => {
            event.preventDefault();
            this.submit().catch(error => this.setStatus(errorMessage(error), "error"));
        });
        this.load().catch(error => this.setStatus(errorMessage(error), "error"));
    }

    render() {
        const title = this.getAttribute("title") || "Account";
        const copy = this.getAttribute("copy") || "Update your personal information.";
        const buttonLabel = this.getAttribute("button-label") || "Save";

        this.root.innerHTML = `
            <style>
                :host { display: block; font: inherit; color: inherit; }
                form {
                    display: grid;
                    gap: 1rem;
                    max-width: 42rem;
                }
                .header { display: grid; gap: .25rem; }
                h2 { margin: 0; font-size: 1.25rem; line-height: 1.2; }
                p { margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); }
                .grid {
                    display: grid;
                    gap: .75rem;
                    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
                }
                label {
                    display: grid;
                    gap: .35rem;
                    font-weight: 700;
                }
                input {
                    box-sizing: border-box;
                    width: 100%;
                    min-height: 2.5rem;
                    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
                    border-radius: .5rem;
                    background: Canvas;
                    color: currentColor;
                    font: inherit;
                    padding: .55rem .7rem;
                }
                input:focus-visible, button:focus-visible {
                    outline: 2px solid currentColor;
                    outline-offset: 2px;
                }
                button {
                    width: max-content;
                    min-height: 2.5rem;
                    border: 0;
                    border-radius: .5rem;
                    background: #0f6b57;
                    color: white;
                    cursor: pointer;
                    font: inherit;
                    font-weight: 700;
                    padding: .55rem .9rem;
                }
                button:disabled { cursor: wait; opacity: .65; }
                .status { min-height: 1.25rem; font-size: .95rem; }
                .status[data-state="error"] { color: #b42318; }
                .status[data-state="success"] { color: #0f6b57; }
            </style>
            <form>
                <div class="header">
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(copy)}</p>
                </div>
                <div class="grid">
                    <label>
                        <span>Display name</span>
                        <input name="displayName" autocomplete="name">
                    </label>
                    <label>
                        <span>Email</span>
                        <input name="email" type="email" autocomplete="email">
                    </label>
                    <label>
                        <span>Phone</span>
                        <input name="phone" autocomplete="tel">
                    </label>
                    <label>
                        <span>Locale</span>
                        <input name="locale" autocomplete="language">
                    </label>
                    <label>
                        <span>Timezone</span>
                        <input name="timezone">
                    </label>
                    <label>
                        <span>Avatar URL</span>
                        <input name="avatarUrl" type="url">
                    </label>
                </div>
                <button type="submit">${escapeHtml(buttonLabel)}</button>
                <p class="status" data-status></p>
            </form>
        `;
    }

    async load() {
        this.setStatus(this.getAttribute("loading-label") || "Loading...", "idle");
        const account = await this.requestSource("getAccount");
        this.account = account;
        for (const name of ["displayName", "email", "phone", "locale", "timezone", "avatarUrl"]) {
            const input = this.root.querySelector(`[name='${name}']`);
            if (input) input.value = account[name] || "";
        }
        this.setStatus("", "idle");
    }

    async submit() {
        this.button.disabled = true;
        this.setStatus(this.getAttribute("saving-label") || "Saving...", "idle");
        try {
            const payload = {};
            for (const name of ["displayName", "email", "phone", "locale", "timezone", "avatarUrl"]) {
                const input = this.root.querySelector(`[name='${name}']`);
                if (input) payload[name] = input.value.trim() || null;
            }
            const account = await this.requestSource("updateAccount", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            this.account = account;
            this.dispatchEvent(new CustomEvent("user-account:saved", {
                bubbles: true,
                composed: true,
                detail: account,
            }));
            this.setStatus(this.getAttribute("saved-label") || "Account saved.", "success");
        } finally {
            this.button.disabled = false;
        }
    }

    async requestSource(endpoint, init = {}) {
        const response = await fetch(this.sourceUrl(endpoint), {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
                ...headersObject(init.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessageFromBody(body, response));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid source response.");
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        const sourceId = this.getAttribute("source-id") || "user-account";
        return `${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`;
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    get form() {
        return this.root.querySelector("form");
    }

    get button() {
        return this.root.querySelector("button");
    }

    get status() {
        return this.root.querySelector("[data-status]");
    }
}

function headersObject(headers) {
    if (!headers) return {};
    return Object.fromEntries(new Headers(headers).entries());
}

function errorMessage(error) {
    return error instanceof Error ? error.message : "Unable to update account.";
}

function errorMessageFromBody(body, response) {
    if (body && typeof body === "object" && "error" in body) return String(body.error);
    return `${response.status} ${response.statusText}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    })[char] || char);
}

customElements.define("BE5_TAG_TO_BE_REPLACED", UserAccountForm);
