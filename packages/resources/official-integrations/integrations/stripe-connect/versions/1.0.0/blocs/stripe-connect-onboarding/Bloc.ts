const CONNECT_JS_URL = "https://connect-js.stripe.com/v1.0/connect.js";

let connectJsLoader = null;

class StripeConnectOnboarding extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.hasMountedOnboarding = false;
    }

    connectedCallback() {
        this.render();
        if (isFramed()) {
            this.button.hidden = true;
            this.setStatus(this.getAttribute("preview-label") || "Stripe onboarding runs on the published page.", "idle");
            return;
        }
        this.refreshStatus().catch(error => this.setStatus(errorMessage(error), "error"));
        if (this.hasAttribute("auto")) {
            this.startOnboarding().catch(error => this.setStatus(errorMessage(error), "error"));
        }
    }

    render() {
        const title = this.getAttribute("title") || "Set up seller payouts";
        const copy = this.getAttribute("copy") || "Complete Stripe verification to receive marketplace payouts.";
        const buttonLabel = this.getAttribute("button-label") || "Activate payouts";

        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: inherit;
                    color: currentColor;
                }

                .shell {
                    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
                    border-radius: 8px;
                    padding: 1rem;
                    display: grid;
                    gap: 1rem;
                    background: color-mix(in srgb, Canvas 96%, currentColor 4%);
                }

                .header {
                    display: grid;
                    gap: .25rem;
                }

                h2 {
                    margin: 0;
                    font-size: 1.125rem;
                    line-height: 1.25;
                }

                p {
                    margin: 0;
                    color: color-mix(in srgb, currentColor 68%, transparent);
                }

                button {
                    width: max-content;
                    border: 0;
                    border-radius: 6px;
                    padding: .625rem .875rem;
                    color: white;
                    background: #0f6b57;
                    font: inherit;
                    font-weight: 700;
                    cursor: pointer;
                }

                button:disabled {
                    cursor: wait;
                    opacity: .65;
                }

                .status {
                    min-height: 1.25rem;
                    color: color-mix(in srgb, currentColor 72%, transparent);
                }

                .status[data-state="error"] {
                    color: #b42318;
                }

                .status[data-state="success"] {
                    color: #0f6b57;
                }

                .onboarding:empty {
                    display: none;
                }
            </style>
            <section class="shell">
                <div class="header">
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(copy)}</p>
                </div>
                <button type="button" data-action="start">${escapeHtml(buttonLabel)}</button>
                <p class="status" data-status></p>
                <div class="onboarding" data-onboarding></div>
            </section>
        `;

        this.button.addEventListener("click", () => {
            this.startOnboarding().catch(error => this.setStatus(errorMessage(error), "error"));
        });
    }

    async refreshStatus() {
        const status = await this.requestSource("getConnectStatus");
        this.dispatchEvent(new CustomEvent("stripe-connect-onboarding:status", {
            bubbles: true,
            composed: true,
            detail: status,
        }));

        if (status.payoutsEnabled === true || status.onboardingStatus === "enabled") {
            this.button.hidden = true;
            this.setStatus(this.getAttribute("connected-label") || "Your payouts are ready.", "success");
            return;
        }

        if (!this.hasMountedOnboarding) {
            this.setStatus(this.statusLabel(status.onboardingStatus), "idle");
        }
    }

    async startOnboarding() {
        if (isFramed()) {
            this.setStatus(this.getAttribute("preview-label") || "Stripe onboarding runs on the published page.", "idle");
            return;
        }
        this.button.disabled = true;
        this.setStatus("Loading Stripe onboarding...", "idle");
        try {
            const config = await this.requestSource("getConnectClientConfig");
            if (typeof config.publishableKey !== "string" || !config.publishableKey) {
                throw new Error("Missing Stripe publishable key.");
            }

            const stripeConnect = await loadConnectJs();
            const instance = stripeConnect.init({
                publishableKey: config.publishableKey,
                fetchClientSecret: async () => {
                    const session = await this.requestSource("createOnboardingSession", {
                        method: "POST",
                        body: JSON.stringify(this.onboardingPayload()),
                    });
                    if (typeof session.clientSecret !== "string" || !session.clientSecret) {
                        throw new Error("Missing Stripe account session client secret.");
                    }
                    return session.clientSecret;
                },
                ...(this.getAttribute("locale") ? { locale: this.getAttribute("locale") } : {}),
            });

            const component = instance.create("account-onboarding");
            component.setOnExit?.(() => {
                this.hasMountedOnboarding = false;
                this.refreshStatus().catch(error => this.setStatus(errorMessage(error), "error"));
            });
            component.setOnLoadError?.(event => {
                this.setStatus(`Unable to load Stripe onboarding. ${eventMessage(event)}`, "error");
            });
            component.setOnStepChange?.(event => {
                this.dispatchEvent(new CustomEvent("stripe-connect-onboarding:step", {
                    bubbles: true,
                    composed: true,
                    detail: event,
                }));
            });

            this.onboardingContainer.replaceChildren(component);
            this.hasMountedOnboarding = true;
            this.setStatus("Complete the Stripe steps below.", "idle");
        } finally {
            this.button.disabled = false;
        }
    }

    onboardingPayload() {
        const payload = {};
        for (const [attribute, field] of [
            ["email", "email"],
            ["country", "country"],
        ]) {
            const value = this.getAttribute(attribute);
            if (value) payload[field] = value;
        }
        return payload;
    }

    statusLabel(status) {
        if (status === "enabled") return "Your payouts are ready.";
        if (status === "onboarding_started" || status === "link_created") return "Payout onboarding is in progress.";
        if (status === "requirements_due") return "Stripe needs more information.";
        return "Ready to activate payouts.";
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
            const message = body && typeof body === "object" && "error" in body
                ? String(body.error)
                : `${response.status} ${response.statusText}`;
            throw new Error(message);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid source response.");
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        const sourceId = this.getAttribute("source-id") || "stripe-connect";
        return `${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`;
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    get button() {
        return this.root.querySelector("[data-action='start']");
    }

    get status() {
        return this.root.querySelector("[data-status]");
    }

    get onboardingContainer() {
        return this.root.querySelector("[data-onboarding]");
    }
}

function loadConnectJs() {
    if (window.StripeConnect?.init) return Promise.resolve(window.StripeConnect);
    if (connectJsLoader) return connectJsLoader;

    connectJsLoader = new Promise((resolve, reject) => {
        const global = window.StripeConnect ?? {};
        const previousOnLoad = global.onLoad;
        global.onLoad = () => {
            previousOnLoad?.();
            if (window.StripeConnect?.init) resolve(window.StripeConnect);
            else reject(new Error("Stripe Connect.js loaded without init()."));
        };
        window.StripeConnect = global;

        if (document.querySelector(`script[src="${CONNECT_JS_URL}"]`)) return;

        const script = document.createElement("script");
        script.src = CONNECT_JS_URL;
        script.async = true;
        script.onerror = () => reject(new Error("Unable to load Stripe Connect.js."));
        document.head.append(script);
    });

    return connectJsLoader;
}

function headersObject(headers) {
    if (!headers) return {};
    return Object.fromEntries(new Headers(headers).entries());
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function eventMessage(event) {
    if (!event || typeof event !== "object") return "";
    if ("error" in event) return errorMessage(event.error);
    return "";
}

function isFramed() {
    try {
        return window.top !== window.self;
    } catch {
        return true;
    }
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", StripeConnectOnboarding);
