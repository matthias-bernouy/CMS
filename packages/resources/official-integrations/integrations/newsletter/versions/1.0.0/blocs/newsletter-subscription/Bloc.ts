class NewsletterSubscription extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();
            this.submit().catch((error) => this.setStatus(errorMessage(error), "error"));
        });
    }

    render() {
        const title = this.getAttribute("title") || "Newsletter";
        const copy = this.getAttribute("copy") || "Recevez nos actualités par e-mail.";
        const emailLabel = this.getAttribute("email-label") || "Adresse e-mail";
        const buttonLabel = this.getAttribute("button-label") || "S’inscrire";

        this.root.innerHTML = `
            <style>
                :host { display: block; font: inherit; color: inherit; }
                form {
                    display: grid;
                    gap: .75rem;
                    max-width: 32rem;
                }
                .header { display: grid; gap: .25rem; }
                h2 { margin: 0; font-size: 1.25rem; line-height: 1.2; }
                p { margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); }
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
                <label>
                    <span>${escapeHtml(emailLabel)}</span>
                    <input name="email" type="email" autocomplete="email" required>
                </label>
                <button type="submit">${escapeHtml(buttonLabel)}</button>
                <p class="status" data-status></p>
            </form>
        `;
    }

    async submit() {
        const email = this.emailInput.value.trim();
        if (!email) {
            return;
        }

        this.button.disabled = true;
        this.setStatus(this.getAttribute("loading-label") || "Enregistrement…", "idle");
        try {
            const result = await this.requestSource("setSubscription", {
                method: "POST",
                body: JSON.stringify({ email, subscribed: !this.hasAttribute("unsubscribe") }),
            });
            this.dispatchEvent(
                new CustomEvent("newsletter-subscription:saved", {
                    bubbles: true,
                    composed: true,
                    detail: result,
                }),
            );
            this.setStatus(this.successLabel(result), "success");
        } finally {
            this.button.disabled = false;
        }
    }

    successLabel(result) {
        if (result.subscribed === false) {
            return this.getAttribute("unsubscribed-label") || "Vous êtes désinscrit(e).";
        }
        return this.getAttribute("subscribed-label") || "Votre inscription est confirmée.";
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
        if (!response.ok) {
            throw new Error(errorMessageFromBody(body, response));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Réponse invalide du service.");
        }
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        const sourceId = this.getAttribute("source-id") || "newsletter";
        return `${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`;
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    get form() {
        return this.root.querySelector("form");
    }

    get emailInput() {
        return this.root.querySelector("input[name='email']");
    }

    get button() {
        return this.root.querySelector("button");
    }

    get status() {
        return this.root.querySelector("[data-status]");
    }
}

function headersObject(headers) {
    if (!headers) {
        return {};
    }
    return Object.fromEntries(new Headers(headers).entries());
}

function errorMessage(error) {
    console.error(error);
    return "Impossible de mettre à jour votre inscription.";
}

function errorMessageFromBody(body, response) {
    if (body && typeof body === "object" && "error" in body) {
        return String(body.error);
    }
    return `${response.status} ${response.statusText}`;
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char] || char,
    );
}

customElements.define("BE5_TAG_TO_BE_REPLACED", NewsletterSubscription);
