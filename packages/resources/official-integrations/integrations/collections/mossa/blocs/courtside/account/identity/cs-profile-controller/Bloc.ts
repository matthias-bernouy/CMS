const CONNECT_JS_URL = "https://connect-js.stripe.com/v1.0/connect.js";

let connectJsLoader = null;
class RemoteRequestError extends Error {}

export class CsProfileController extends HTMLElement {
    connectedCallback() {
        this.hidden = true;
        this.scope = this.closest("cs-app-shell") || document;
        this.saveButton?.addEventListener("click", this.onSave);
        this.avatar?.addEventListener("avatar-change", this.onAvatarChange);
        this.verificationButton?.addEventListener("click", this.onStartVerification);
        this.start().catch((error) =>
            this.setProfileStatus(
                publicErrorMessage(error, "Impossible de charger ton profil. Réessaie dans quelques instants."),
                "error",
            ),
        );
    }

    disconnectedCallback() {
        this.saveButton?.removeEventListener("click", this.onSave);
        this.avatar?.removeEventListener("avatar-change", this.onAvatarChange);
        this.verificationButton?.removeEventListener("click", this.onStartVerification);
    }

    onSave = () => {
        this.saveAccount().catch((error) =>
            this.setProfileStatus(
                publicErrorMessage(error, "Impossible d'enregistrer ton profil. Réessaie dans quelques instants."),
                "error",
            ),
        );
    };

    onAvatarChange = (event) => {
        const file = event.detail?.file;
        if (!file) {
            return;
        }
        this.uploadAvatar(file).catch((error) =>
            this.setProfileStatus(
                publicErrorMessage(error, "Impossible d'envoyer ta photo. Vérifie son format puis réessaie."),
                "error",
            ),
        );
    };

    onStartVerification = () => {
        this.startVerification().catch((error) =>
            this.setVerificationStatus(
                publicErrorMessage(
                    error,
                    "Impossible de lancer la vérification vendeur. Réessaie dans quelques instants.",
                ),
                "error",
            ),
        );
    };

    async start() {
        await this.whenControlsReady();
        await Promise.allSettled([
            this.loadAccount().catch((error) =>
                this.setProfileStatus(
                    publicErrorMessage(error, "Impossible de charger ton profil. Réessaie dans quelques instants."),
                    "error",
                ),
            ),
            this.refreshVerification().catch((error) =>
                this.setVerificationStatus(
                    publicErrorMessage(
                        error,
                        "Impossible de mettre à jour la vérification vendeur. Réessaie dans quelques instants.",
                    ),
                    "error",
                ),
            ),
        ]);
    }

    async loadAccount() {
        this.setProfileStatus("Chargement du profil...", "idle");
        const account = await this.requestSource(this.sourceId, "getAccount");
        this.account = account;
        this.fillAccount(account);
        this.setProfileStatus("", "success");
    }

    async saveAccount() {
        this.setButtonLoading(this.saveButton, true);
        this.setProfileStatus("Enregistrement...", "idle");
        try {
            const account = await this.requestSource(this.sourceId, "updateAccount", {
                method: "POST",
                body: JSON.stringify(this.accountPayload()),
            });
            this.account = account;
            this.fillAccount(account);
            this.setProfileStatus("Profil enregistré.", "success");
        } finally {
            this.setButtonLoading(this.saveButton, false);
        }
    }

    async uploadAvatar(file) {
        const body = new FormData();
        body.set("file", file);
        this.setProfileStatus("Envoi de l'avatar...", "idle");
        await this.requestSource(this.sourceId, "uploadAccountAvatar", { method: "POST", body });
        await this.loadAccount();
    }

    async refreshVerification() {
        const status = await this.requestSource(this.stripeSourceId, "getConnectStatus");
        this.applyVerificationStatus(status);
    }

    async startVerification() {
        if (isFramed()) {
            this.setVerificationStatus("La vérification Stripe se lance sur la page publiée.", "idle");
            return;
        }

        this.setButtonLoading(this.verificationButton, true);
        this.setVerificationStatus("Chargement de la vérification...", "idle");
        try {
            const config = await this.requestSource(this.stripeSourceId, "getConnectClientConfig");
            if (!config.publishableKey) {
                throw new Error("Clé publique Stripe manquante.");
            }

            const stripeConnect = await loadConnectJs();
            const instance = stripeConnect.init({
                publishableKey: config.publishableKey,
                fetchClientSecret: async () => {
                    const session = await this.requestSource(this.stripeSourceId, "createOnboardingSession", {
                        method: "POST",
                        body: JSON.stringify(this.verificationPayload()),
                    });
                    if (!session.clientSecret) {
                        throw new Error("Session Stripe incomplète.");
                    }
                    return session.clientSecret;
                },
                ...(this.getAttribute("locale") ? { locale: this.getAttribute("locale") } : {}),
            });

            const component = instance.create("account-onboarding");
            component.setOnExit?.(() =>
                this.refreshVerification().catch((error) =>
                    this.setVerificationStatus(
                        publicErrorMessage(
                            error,
                            "Impossible de mettre à jour la vérification vendeur. Réessaie dans quelques instants.",
                        ),
                        "error",
                    ),
                ),
            );
            component.setOnLoadError?.(() =>
                this.setVerificationStatus(
                    "Impossible de charger la vérification vendeur. Réessaie dans quelques instants.",
                    "error",
                ),
            );
            this.verificationMount?.replaceChildren(component);
            this.setVerificationStatus("Complète les étapes Stripe ci-dessous.", "idle");
        } finally {
            this.setButtonLoading(this.verificationButton, false);
        }
    }

    fillAccount(account) {
        for (const field of this.accountFields) {
            const key = field.dataset.accountField;
            this.setFieldValue(field, account?.[key] || "");
        }

        const displayName = account?.displayName || account?.email || "Compte Courtside";
        const email = account?.email || "";
        this.setText("[data-account-name]", displayName);
        this.setText("[data-account-email]", email);
        this.setText("[data-account-initials]", initials(displayName || email));
    }

    accountPayload() {
        const payload = {};
        for (const field of this.accountFields) {
            const key = field.dataset.accountField;
            if (!key) {
                continue;
            }
            payload[key] = field.value || "";
        }
        return payload;
    }

    applyVerificationStatus(status) {
        if (status.connected === true || status.onboardingStatus === "enabled") {
            this.verificationButton?.setAttribute("disabled", "yes");
            this.setVerificationStatus("Identité vendeur validée.", "success");
            return;
        }
        this.verificationButton?.removeAttribute("disabled");
        if (status.onboardingStatus === "requirements_due") {
            this.setVerificationStatus("Stripe demande des informations complémentaires.", "idle");
            return;
        }
        if (status.onboardingStatus === "onboarding_started" || status.onboardingStatus === "link_created") {
            this.setVerificationStatus("Vérification Stripe en cours.", "idle");
            return;
        }
        this.setVerificationStatus("Prêt à lancer la vérification vendeur.", "idle");
    }

    verificationPayload() {
        const payload = {};
        for (const [attribute, field] of [
            ["email", "email"],
            ["country", "country"],
            ["business-type", "businessType"],
        ]) {
            const value = this.getAttribute(attribute);
            if (value) {
                payload[field] = value;
            }
        }
        if (!payload.email && this.account?.email) {
            payload.email = this.account.email;
        }
        return payload;
    }

    async requestSource(sourceId, endpoint, init = {}) {
        let response;
        try {
            response = await fetch(this.sourceUrl(sourceId, endpoint), {
                credentials: "include",
                ...init,
                headers: {
                    accept: "application/json",
                    ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
                    ...(init.headers || {}),
                },
            });
        } catch {
            throw new Error("Le service est momentanément indisponible. Réessaie dans quelques instants.");
        }
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new RemoteRequestError(responseMessage(body));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Le service est momentanément indisponible. Réessaie dans quelques instants.");
        }
        return body;
    }

    sourceUrl(sourceId, endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        return `${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`;
    }

    setText(selector, value) {
        const node = this.scope.querySelector(selector);
        if (node) {
            node.textContent = value || "";
        }
    }

    async whenControlsReady() {
        const tags = new Set(
            Array.from(
                this.scope.querySelectorAll(
                    "[data-account-field], [data-profile-save], [data-seller-verification-start]",
                ),
            )
                .map((el) => el.tagName.toLowerCase())
                .filter((tag) => tag.includes("-")),
        );
        await Promise.all(Array.from(tags).map((tag) => customElements.whenDefined(tag).catch(() => null)));
    }

    setFieldValue(field, value) {
        if (Object.prototype.hasOwnProperty.call(field, "value")) {
            delete field.value;
        }
        field.value = value || "";
        if (field.value !== (value || "")) {
            if (value) {
                field.setAttribute("value", value);
            } else {
                field.removeAttribute("value");
            }
        }
    }

    setProfileStatus(message, state) {
        this.setStatus(this.profileStatus, message, state);
    }

    setVerificationStatus(message, state) {
        this.setStatus(this.verificationStatus, message, state);
    }

    setStatus(node, message, state) {
        if (!node) {
            return;
        }
        node.textContent = message || "";
        node.dataset.state = state || "idle";
    }

    setButtonLoading(button, loading) {
        if (!button) {
            return;
        }
        loading ? button.setAttribute("disabled", "yes") : button.removeAttribute("disabled");
    }

    get sourceId() {
        return this.getAttribute("source-id") || "user-account";
    }

    get stripeSourceId() {
        return this.getAttribute("stripe-source-id") || "stripe-connect";
    }

    get accountFields() {
        return Array.from(this.scope.querySelectorAll("[data-account-field]"));
    }

    get saveButton() {
        return this.scope.querySelector("[data-profile-save]");
    }

    get avatar() {
        return this.scope.querySelector("[data-profile-avatar]");
    }

    get profileStatus() {
        return this.scope.querySelector("[data-profile-status]");
    }

    get verificationButton() {
        return this.scope.querySelector("[data-seller-verification-start]");
    }

    get verificationStatus() {
        return this.scope.querySelector("[data-seller-verification-status]");
    }

    get verificationMount() {
        return this.scope.querySelector("[data-seller-verification-mount]");
    }
}

function loadConnectJs() {
    if (window.StripeConnect?.init) {
        return Promise.resolve(window.StripeConnect);
    }
    if (connectJsLoader) {
        return connectJsLoader;
    }

    connectJsLoader = new Promise((resolve, reject) => {
        const global = window.StripeConnect ?? {};
        const previousOnLoad = global.onLoad;
        global.onLoad = () => {
            previousOnLoad?.();
            if (window.StripeConnect?.init) {
                resolve(window.StripeConnect);
            } else {
                reject(new Error("Stripe Connect.js chargé sans init()."));
            }
        };
        window.StripeConnect = global;

        if (document.querySelector(`script[src="${CONNECT_JS_URL}"]`)) {
            return;
        }

        const script = document.createElement("script");
        script.src = CONNECT_JS_URL;
        script.async = true;
        script.onerror = () => reject(new Error("Impossible de charger Stripe Connect.js."));
        document.head.append(script);
    });

    return connectJsLoader;
}

function initials(value) {
    const parts = String(value).split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map((part) => part[0]).join("") || "CS").toUpperCase();
}

function publicErrorMessage(error, fallback) {
    return error instanceof RemoteRequestError && isFrenchUserMessage(error.message) ? error.message : fallback;
}

function responseMessage(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = body.error ?? body.message;
    return typeof value === "string" ? value.trim() : "";
}

function isFrenchUserMessage(value) {
    return /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|profil|compte|vendeur|vérification|adresse|téléphone|photo)\b/i.test(
        value,
    );
}

function isFramed() {
    try {
        return window.top !== window.self;
    } catch {
        return true;
    }
}
