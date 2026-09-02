import { cssEscape, errorMessage, escapeHtml, preference } from "./values";

class CommerceNotificationPreferences extends HTMLElement {
    root = this.attachShadow({ mode: "open" });
    items = [];

    connectedCallback() {
        this.render();
        void this.load();
    }

    async load() {
        this.setStatus(this.text("loading-label", "Loading preferences…"));
        try {
            const payload = await this.request("getMyNotificationPreferences");
            this.items = Array.isArray(payload.items) ? payload.items.map(preference) : [];
            this.render();
        } catch (error) {
            this.setStatus(errorMessage(error), true);
        }
    }

    async save(event) {
        event.preventDefault();
        const button = this.root.querySelector("button");
        if (button) {
            button.disabled = true;
        }
        this.setStatus(this.text("saving-label", "Saving…"));
        try {
            const preferences = this.items
                .filter((item) => item.configurable)
                .map((item) => ({
                    key: item.key,
                    enabled: this.root.querySelector(`[data-key="${cssEscape(item.key)}"]`)?.checked === true,
                }));
            const payload = await this.request("updateMyNotificationPreferences", {
                method: "POST",
                body: JSON.stringify({ preferences }),
            });
            this.items = Array.isArray(payload.items) ? payload.items.map(preference) : this.items;
            this.render();
            this.setStatus(this.text("saved-label", "Preferences saved."));
        } catch (error) {
            this.setStatus(errorMessage(error), true);
            if (button) {
                button.disabled = false;
            }
        }
    }

    render() {
        const title = escapeHtml(this.text("title", "Email notifications"));
        const description = escapeHtml(
            this.text("description", "Choose which optional Commerce emails you want to receive."),
        );
        const fields = this.items
            .map(
                (item) => `
                    <label>
                        <input type="checkbox" data-key="${escapeHtml(item.key)}"
                            ${item.enabled ? "checked" : ""} ${item.configurable ? "" : "disabled"}>
                        <span>
                            <strong>${escapeHtml(item.label)}</strong>
                            <small>${escapeHtml(item.description)}</small>
                        </span>
                    </label>`,
            )
            .join("");
        this.root.innerHTML = `
            <style>
                :host { display: block; color: inherit; font: inherit; }
                form { display: grid; gap: 1rem; max-width: 42rem; }
                header, fieldset, label, label span { display: grid; gap: .35rem; }
                h2, p { margin: 0; }
                fieldset { border: 0; margin: 0; padding: 0; gap: .75rem; }
                label {
                    grid-template-columns: auto 1fr; align-items: start; gap: .75rem;
                    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
                    border-radius: .65rem; padding: .8rem;
                }
                input { width: 1.15rem; height: 1.15rem; margin: .1rem 0 0; }
                small, header p { opacity: .7; }
                button {
                    width: max-content; border: 0; border-radius: .55rem;
                    background: #0f6b57; color: white; font: inherit;
                    font-weight: 700; padding: .65rem 1rem; cursor: pointer;
                }
                button:disabled { cursor: wait; opacity: .65; }
                [data-status] { min-height: 1.25rem; }
                [data-status][data-error] { color: #b42318; }
            </style>
            <form>
                <header><h2>${title}</h2><p>${description}</p></header>
                <fieldset>${fields}</fieldset>
                <button type="submit">${escapeHtml(this.text("button-label", "Save preferences"))}</button>
                <p data-status></p>
            </form>`;
        this.root.querySelector("form")?.addEventListener("submit", (event) => void this.save(event));
    }

    async request(endpoint, init = {}) {
        const response = await fetch(`${this.sourceBase()}/${endpoint}`, {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
            },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error(`Notification preferences failed (${response.status})`);
        }
        return payload;
    }

    sourceBase() {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const source = encodeURIComponent(this.getAttribute("source-id") || "commerce");
        return `${prefix}/${source}`;
    }

    setStatus(message, error = false) {
        const status = this.root.querySelector("[data-status]");
        if (status) {
            status.textContent = message;
            status.toggleAttribute("data-error", error);
        }
    }

    text(attribute, fallback) {
        return this.getAttribute(attribute)?.trim() || fallback;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNotificationPreferences);
