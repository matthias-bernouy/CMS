const STRIPE_JS_URL = "https://js.stripe.com/v3/";
const PAYMENT_ELEMENT_SLOT = "stripe-payment-element";
const PAYMENT_RECONCILIATION_POLL_TIMEOUT_MS = 60_000;

let stripeJsLoader = null;

class CommerceStripePayment extends HTMLElement {
    static get observedAttributes() {
        return [
            "order-id",
            "return-url",
            "layout",
            "link-wallet",
            "title",
            "copy",
            "summary-label",
            "button-label",
            "success-label",
            "accent-color",
            "background-color",
            "border-color",
            "text-color",
            "appearance",
        ];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.clientConfigPromise = null;
        this.initializeTimer = null;
        this.initializedSignature = null;
        this.stripe = null;
        this.elements = null;
        this.paymentElement = null;
        this.payment = null;
        this.paymentMountElement = null;
        this.paymentSubmissionLocked = false;
    }

    connectedCallback() {
        this.ensurePaymentMount();
        this.render();
        this.syncPresentation();
        if (isFramed()) {
            this.paymentMount.hidden = true;
            this.paymentRegion.hidden = true;
            this.preview.hidden = false;
            this.submitButton.disabled = true;
            this.setStatus(
                this.getAttribute("preview-label") ||
                    "Le formulaire de paiement sécurisé Stripe apparaîtra sur la page publiée.",
                "idle",
            );
            return;
        }
        this.paymentMount.hidden = false;
        this.paymentRegion.hidden = false;
        if (this.readPaymentInput(false)) {
            this.scheduleInitialize();
        }
    }

    disconnectedCallback() {
        clearTimeout(this.initializeTimer);
        this.paymentElement?.destroy();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected || !this.form) {
            return;
        }
        if (name === "order-id") {
            this.paymentSubmissionLocked = false;
        }
        this.syncPresentation();
        if (
            name === "accent-color" ||
            name === "background-color" ||
            name === "border-color" ||
            name === "text-color"
        ) {
            this.elements?.update({ appearance: this.stripeAppearance() });
            return;
        }
        if (name === "layout") {
            this.paymentElement?.update({ layout: { type: this.paymentLayout() } });
            return;
        }
        if (paymentAttributes().includes(name) && !isFramed()) {
            this.initializedSignature = null;
            this.submitButton.disabled = true;
            this.scheduleInitialize();
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    --payment-accent: var(--primary-base, #16634d);
                    --payment-accent-contrasted: var(--primary-contrasted, #ffffff);
                    --payment-background: var(--bg-surface, #ffffff);
                    --payment-border: var(--border-default, #dfddd4);
                    --payment-text: var(--text-main, #26261f);
                    display: block;
                    color: var(--payment-text);
                    font-family: inherit;
                }

                * { box-sizing: border-box; }

                .shell {
                    display: grid;
                    gap: 1.25rem;
                    padding: clamp(1rem, 3vw, 1.5rem);
                    border: 1px solid var(--payment-border);
                    border-radius: var(--radius-card, .75rem);
                    background: var(--payment-background);
                    box-shadow: var(--shadow-soft, 0 2px 10px rgb(18 30 24 / .08));
                }

                :host([appearance="embedded"]) .shell {
                    padding: 0;
                    border: 0;
                    border-radius: 0;
                    background: transparent;
                    box-shadow: none;
                }

                :host([appearance="embedded"]) .header { display: none; }

                .header,
                form,
                .summary,
                .preview {
                    display: grid;
                }

                .header { gap: .4rem; }
                form { gap: 1rem; }
                h2, p { margin: 0; }
                h2 { font-family: inherit; font-size: 1.25rem; }

                .muted,
                .security {
                    color: color-mix(in srgb, var(--payment-text) 68%, transparent);
                }

                .summary {
                    grid-template-columns: 1fr auto;
                    gap: .75rem;
                    align-items: baseline;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--payment-border);
                }

                .amount {
                    font-size: 1.15rem;
                    font-weight: 750;
                }

                [data-payment-region],
                slot[name="stripe-payment-element"],
                ::slotted([slot="stripe-payment-element"]) {
                    display: block;
                    width: 100%;
                    min-width: 0;
                    min-height: 2.75rem;
                }

                .preview {
                    grid-template-columns: 1fr 6rem 5rem;
                    gap: .6rem;
                }

                .preview span {
                    min-height: 2.75rem;
                    padding: .75rem;
                    border: 1px solid var(--payment-border);
                    border-radius: var(--radius-control, .375rem);
                    color: color-mix(in srgb, var(--payment-text) 52%, transparent);
                    background: var(--payment-background);
                }

                button {
                    width: 100%;
                    min-height: 2.75rem;
                    padding: .72rem 1rem;
                    border: 1px solid var(--payment-accent);
                    border-radius: var(--radius-control, .375rem);
                    color: var(--payment-accent-contrasted);
                    background: var(--payment-accent);
                    font: inherit;
                    font-weight: 750;
                    cursor: pointer;
                }

                button:focus-visible {
                    outline: 2px solid var(--payment-accent);
                    outline-offset: 2px;
                }

                button:disabled {
                    cursor: wait;
                    opacity: .65;
                }

                .security {
                    display: flex;
                    gap: .5rem;
                    align-items: flex-start;
                    font-size: .875rem;
                }

                .security svg {
                    width: 1.1rem;
                    height: 1.1rem;
                    flex: 0 0 auto;
                }

                .status {
                    min-height: 1.25rem;
                    font-size: .925rem;
                }

                .status:empty { display: none; }
                .status[data-state="error"] { color: var(--danger-base, #c4473d); }
                .status[data-state="success"] { color: var(--success-base, #21865f); }
                [hidden] { display: none !important; }

                @media (max-width: 30rem) {
                    .preview { grid-template-columns: 1fr; }
                }
            </style>
            <section class="shell">
                <div class="header">
                    <h2 data-title></h2>
                    <p class="muted" data-copy></p>
                </div>
                <div class="summary">
                    <span data-description></span>
                    <strong class="amount" data-amount></strong>
                </div>
                <form data-form novalidate>
                    <div data-payment-region>
                        <slot name="stripe-payment-element"></slot>
                    </div>
                    <div class="preview" data-preview hidden aria-hidden="true">
                        <span>Numéro de carte</span>
                        <span>MM / AA</span>
                        <span>CVC</span>
                    </div>
                    <div class="security">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <rect x="4.5" y="10" width="15" height="10" rx="2"></rect>
                            <path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path>
                            <path d="M12 14v2.5"></path>
                        </svg>
                        <span>Paiement chiffré. Les coordonnées de carte ne transitent jamais par nos serveurs.</span>
                    </div>
                    <button type="submit" data-submit disabled></button>
                    <p class="status" data-status aria-live="polite"></p>
                </form>
            </section>
        `;
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();
            this.confirm().catch((error) => this.fail(error));
        });
    }

    ensurePaymentMount() {
        if (this.paymentMountElement?.parentElement === this) {
            return;
        }
        const mount = document.createElement("div");
        mount.slot = PAYMENT_ELEMENT_SLOT;
        mount.setAttribute("data-commerce-stripe-payment-mount", "");
        this.append(mount);
        this.paymentMountElement = mount;
    }

    syncPresentation() {
        const amount = trustedPaymentAmount(this.payment);
        this.title.textContent = this.getAttribute("title") || "Paiement sécurisé";
        this.copy.textContent =
            this.getAttribute("copy") || "Choisissez un moyen de paiement et confirmez la commande.";
        this.descriptionElement.textContent = this.getAttribute("summary-label") || "Total de la commande";
        this.amountElement.textContent = amount ? formatAmount(amount.amountTotal, amount.currency) : "—";
        this.submitButton.textContent =
            this.getAttribute("button-label") ||
            (amount ? `Payer ${formatAmount(amount.amountTotal, amount.currency)}` : "Payer");
        for (const [attribute, property] of [
            ["accent-color", "--payment-accent"],
            ["background-color", "--payment-background"],
            ["border-color", "--payment-border"],
            ["text-color", "--payment-text"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
    }

    scheduleInitialize() {
        clearTimeout(this.initializeTimer);
        this.initializeTimer = setTimeout(() => {
            this.initialize().catch((error) => this.fail(error));
        }, 25);
    }

    async initialize() {
        const input = this.readPaymentInput(true);
        const signature = JSON.stringify(input);
        if (signature === this.initializedSignature && this.elements) {
            return;
        }

        this.submitButton.disabled = true;
        this.setStatus("Préparation du paiement sécurisé…", "idle");
        const [Stripe, config, payment] = await Promise.all([
            loadStripeJs(),
            this.clientConfig(),
            this.requestFunction("createPaymentForOrder", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        ]);
        if (JSON.stringify(this.readPaymentInput(false)) !== signature) {
            this.scheduleInitialize();
            return;
        }

        this.payment = payment;
        this.syncPresentation();
        if (this.presentExistingPayment(payment)) {
            this.initializedSignature = signature;
            return;
        }
        if (typeof payment.clientSecret !== "string" || !payment.clientSecret.includes("_secret")) {
            throw new Error("Le service de paiement n’a pas renvoyé de session valide.");
        }

        await waitUntilVisible(this);

        this.paymentElement?.destroy();
        this.stripe = Stripe(config.publishableKey);
        this.elements = this.stripe.elements({
            clientSecret: payment.clientSecret,
            appearance: this.stripeAppearance(),
            locale: "auto",
        });
        this.paymentElement = this.elements.create("payment", {
            layout: { type: this.paymentLayout() },
            wallets: { link: this.linkWallet() },
        });
        const ready = paymentElementReady(this.paymentElement);
        this.paymentMount.replaceChildren();
        this.paymentElement.mount(this.paymentMount);
        this.setStatus("Chargement du formulaire de paiement…", "idle");
        await ready;
        this.initializedSignature = signature;
        this.submitButton.disabled = false;
        this.setStatus("", "idle");
        this.dispatch("ready", { paymentId: payment.paymentId });
        await this.applyRedirectResult(payment.clientSecret);
    }

    async confirm() {
        if (!this.stripe || !this.elements || !this.payment) {
            throw new Error("Le paiement n’est pas encore prêt.");
        }
        this.submitButton.disabled = true;
        this.setStatus("Confirmation du paiement…", "idle");
        const result = await this.stripe.confirmPayment({
            elements: this.elements,
            confirmParams: { return_url: this.returnUrl(this.payment.paymentId) },
            redirect: "if_required",
        });
        if (result.error) {
            throw new Error(result.error.message || "Le paiement a été refusé.");
        }
        await this.completePayment(result.paymentIntent);
    }

    async applyRedirectResult(clientSecret) {
        const returnedSecret = new URL(window.location.href).searchParams.get("payment_intent_client_secret");
        if (!returnedSecret || returnedSecret !== clientSecret) {
            return;
        }
        const result = await this.stripe.retrievePaymentIntent(clientSecret);
        if (result.error) {
            throw new Error(result.error.message || "Impossible de récupérer le paiement.");
        }
        await this.completePayment(result.paymentIntent);
    }

    async completePayment(paymentIntent) {
        if (paymentIntent?.status === "requires_payment_method" || paymentIntent?.status === "canceled") {
            this.submitButton.disabled = false;
            throw new Error("Impossible de confirmer le paiement.");
        }
        this.paymentSubmissionLocked = true;
        this.setStatus("Vérification sécurisée du paiement…", "idle");
        const payment = await this.refreshPaymentUntilSettled();
        this.payment = payment;
        this.syncPresentation();
        if (!this.presentExistingPayment(payment)) {
            throw new Error("Impossible de confirmer le paiement.");
        }
        this.cleanRedirectParameters();
    }

    async refreshPaymentUntilSettled() {
        let latest = null;
        const deadline = Date.now() + PAYMENT_RECONCILIATION_POLL_TIMEOUT_MS;
        for (const delay of [0, 250, 500, 1_000, 1_500, 2_500, 4_000, 6_000, 8_000, 10_000, 12_000, 14_000]) {
            const remaining = deadline - Date.now();
            if (delay && remaining <= 0) {
                break;
            }
            if (delay) {
                await wait(Math.min(delay, remaining));
            }
            if (Date.now() >= deadline) {
                break;
            }
            const result = await this.requestFunction("refreshPaymentForOrder", {
                method: "POST",
                body: JSON.stringify(this.readPaymentInput(true)),
            });
            latest = result.payment && typeof result.payment === "object" ? result.payment : result;
            const state = protectedPaymentState(latest);
            if (state !== "processing" && state !== "requires_action" && state !== "created") {
                return latest;
            }
        }
        return latest || this.payment;
    }

    presentExistingPayment(payment) {
        const state = protectedPaymentState(payment);
        if (state === "succeeded") {
            this.setStatus(this.getAttribute("success-label") || "Paiement confirmé. Merci !", "success");
            this.lockPaymentSubmission();
            this.dispatch("success", payment);
            return true;
        }
        if (state === "processing") {
            this.setStatus("Paiement reçu et en cours de vérification.", "idle");
            this.lockPaymentSubmission();
            this.dispatch("processing", payment);
            return true;
        }
        if (state === "refunded" || state === "partially_refunded") {
            this.setStatus(state === "refunded" ? "Paiement remboursé." : "Paiement partiellement remboursé.", "idle");
            this.lockPaymentSubmission();
            this.dispatch("refund", payment);
            return true;
        }
        if (state === "disputed" || state === "manual_review") {
            this.setStatus("Paiement temporairement suspendu pour vérification.", "idle");
            this.lockPaymentSubmission();
            this.dispatch("blocked", payment);
            return true;
        }
        return false;
    }

    lockPaymentSubmission() {
        this.paymentSubmissionLocked = true;
        this.form.querySelectorAll("button").forEach((button) => (button.disabled = true));
    }

    async clientConfig() {
        if (!this.clientConfigPromise) {
            this.clientConfigPromise = this.requestFunction("getStripePaymentClientConfig").then((config) => {
                if (typeof config.publishableKey !== "string" || !config.publishableKey.startsWith("pk_")) {
                    throw new Error("La configuration du service de paiement est incomplète.");
                }
                return config;
            });
        }
        return this.clientConfigPromise;
    }

    async requestFunction(id, options = {}) {
        return this.requestJson(`/.cms/sources/system-functions/${encodeURIComponent(id)}`, options);
    }

    async requestJson(path, options = {}) {
        const url = new URL(path, window.location.origin);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
        const { query: _query, ...requestOptions } = options;
        const response = await fetch(url, {
            credentials: "include",
            ...requestOptions,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
                ...headersObject(options.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            const message =
                body && typeof body === "object" && "error" in body
                    ? String(body.error)
                    : `${response.status} ${response.statusText}`;
            throw new Error(message);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Réponse de paiement invalide.");
        }
        return body;
    }

    readPaymentInput(required) {
        const orderId = Number(this.getAttribute("order-id")?.trim());
        if (!Number.isSafeInteger(orderId) || orderId < 1) {
            if (required) {
                throw new Error("Le bloc de paiement doit être associé à une commande valide.");
            }
            return null;
        }
        return { orderId };
    }

    stripeAppearance() {
        return {
            theme: "stripe",
            variables: {
                colorPrimary: this.resolveColor(this.getAttribute("accent-color"), "--primary-base", "#16634d"),
                colorBackground: this.resolveColor(this.getAttribute("background-color"), "--bg-surface", "#ffffff"),
                colorText: this.resolveColor(this.getAttribute("text-color"), "--text-main", "#26261f"),
                colorDanger: this.resolveColor(null, "--danger-base", "#c4473d"),
                colorSuccess: this.resolveColor(null, "--success-base", "#21865f"),
                fontFamily: getComputedStyle(this).fontFamily,
                borderRadius: getComputedStyle(this).getPropertyValue("--radius-control").trim() || "6px",
            },
            rules: {
                ".Input": {
                    borderColor: this.resolveColor(this.getAttribute("border-color"), "--border-default", "#dfddd4"),
                },
            },
        };
    }

    resolveColor(value, variable, fallback) {
        const probe = document.createElement("span");
        probe.style.color = value?.trim() || `var(${variable}, ${fallback})`;
        probe.hidden = true;
        this.root.append(probe);
        const resolved = getComputedStyle(probe).color || fallback;
        probe.remove();
        return resolved;
    }

    paymentLayout() {
        return this.getAttribute("layout") === "accordion" ? "accordion" : "tabs";
    }

    linkWallet() {
        return this.getAttribute("link-wallet") === "auto" ? "auto" : "never";
    }

    returnUrl(paymentId) {
        const value = this.getAttribute("return-url")?.trim() || window.location.href;
        const url = new URL(value, window.location.href);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("L’URL de retour du paiement est invalide.");
        }
        url.searchParams.set("cms_payment_id", String(paymentId));
        return url.toString();
    }

    cleanRedirectParameters() {
        const url = new URL(window.location.href);
        for (const name of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) {
            url.searchParams.delete(name);
        }
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    fail(error) {
        const input = this.readPaymentInput(false);
        const currentFormIsUsable = Boolean(
            input && this.elements && JSON.stringify(input) === this.initializedSignature,
        );
        this.submitButton.disabled = this.paymentSubmissionLocked || !currentFormIsUsable;
        this.setStatus(errorMessage(error), "error");
        this.dispatch("error", { message: errorMessage(error) });
    }

    dispatch(name, detail) {
        this.dispatchEvent(
            new CustomEvent(`commerce-stripe-payment:${name}`, {
                bubbles: true,
                composed: true,
                detail,
            }),
        );
    }

    get form() {
        return this.root.querySelector("[data-form]");
    }
    get title() {
        return this.root.querySelector("[data-title]");
    }
    get copy() {
        return this.root.querySelector("[data-copy]");
    }
    get descriptionElement() {
        return this.root.querySelector("[data-description]");
    }
    get amountElement() {
        return this.root.querySelector("[data-amount]");
    }
    get paymentMount() {
        return this.paymentMountElement;
    }
    get paymentRegion() {
        return this.root.querySelector("[data-payment-region]");
    }
    get preview() {
        return this.root.querySelector("[data-preview]");
    }
    get submitButton() {
        return this.root.querySelector("[data-submit]");
    }
    get status() {
        return this.root.querySelector("[data-status]");
    }
}

function paymentAttributes() {
    return ["order-id", "link-wallet"];
}

function trustedPaymentAmount(payment) {
    const amount = payment?.buyerTotalAmount ?? payment?.amountTotal;
    return payment && Number.isSafeInteger(amount) && typeof payment.currency === "string"
        ? { amountTotal: amount, currency: payment.currency }
        : null;
}

function protectedPaymentState(payment) {
    const settlement = String(payment?.settlementStatus || "").toLowerCase();
    const dispute = String(payment?.disputeStatus || "none").toLowerCase();
    const amountTotal = Number(payment?.amountTotal);
    const refundedAmount = Number(payment?.refundedAmount);
    if (["open", "under_review", "lost"].includes(dispute)) {
        return "disputed";
    }
    if (payment?.reconciliationPending === true && !["blocked", "reversed"].includes(settlement)) {
        return "processing";
    }
    if (settlement === "manual_review") {
        return "manual_review";
    }
    if (
        settlement === "refunded" ||
        (Number.isSafeInteger(amountTotal) && amountTotal > 0 && refundedAmount >= amountTotal)
    ) {
        return "refunded";
    }
    if (Number.isSafeInteger(refundedAmount) && refundedAmount > 0) {
        return "partially_refunded";
    }
    if (["refund_pending", "reversal_pending", "release_pending"].includes(settlement)) {
        return "processing";
    }
    if (["blocked", "reversed"].includes(settlement)) {
        return "manual_review";
    }
    const state = String(payment?.paymentStatus || payment?.status || "").toLowerCase();
    if (["succeeded", "paid"].includes(state)) {
        return "succeeded";
    }
    if (["processing", "payment_pending"].includes(state)) {
        return "processing";
    }
    if (["requires_action", "requires_payment_method"].includes(state)) {
        return "requires_action";
    }
    if (
        ["partially_refunded", "refunded", "disputed", "manual_review", "failed", "cancelled", "canceled"].includes(
            state,
        )
    ) {
        return state === "canceled" ? "cancelled" : state;
    }
    return "created";
}

function formatAmount(amount, currency) {
    try {
        const locale = document.documentElement.lang || navigator.language || "fr-FR";
        return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(
            amount / 100,
        );
    } catch {
        return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
}

function loadStripeJs() {
    if (typeof window.Stripe === "function") {
        return Promise.resolve(window.Stripe);
    }
    if (stripeJsLoader) {
        return stripeJsLoader;
    }
    stripeJsLoader = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${STRIPE_JS_URL}"]`);
        const script = existing || document.createElement("script");
        script.addEventListener(
            "load",
            () => {
                if (typeof window.Stripe === "function") {
                    resolve(window.Stripe);
                } else {
                    reject(new Error("Le service de paiement est indisponible."));
                }
            },
            { once: true },
        );
        script.addEventListener("error", () => reject(new Error("Impossible de charger le service de paiement.")), {
            once: true,
        });
        if (!existing) {
            script.src = STRIPE_JS_URL;
            script.async = true;
            document.head.append(script);
        }
    });
    return stripeJsLoader;
}

function waitUntilVisible(element) {
    return new Promise((resolve, reject) => {
        let frame = null;
        let lastWidth = null;
        let stableFrames = 0;
        const timeout = setTimeout(() => {
            finish(() => reject(new Error("Le formulaire de paiement ne peut pas être affiché.")));
        }, 10_000);
        const schedule = () => {
            if (frame !== null) {
                return;
            }
            frame = requestAnimationFrame(check);
        };
        const check = () => {
            frame = null;
            if (!isVisible(element)) {
                lastWidth = null;
                stableFrames = 0;
                return;
            }
            const width = element.getBoundingClientRect().width;
            stableFrames = lastWidth !== null && Math.abs(width - lastWidth) < 0.5 ? stableFrames + 1 : 0;
            lastWidth = width;
            if (stableFrames >= 2) {
                finish(resolve);
                return;
            }
            schedule();
        };
        const finish = (callback) => {
            clearTimeout(timeout);
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            observer.disconnect();
            callback();
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(element);
        schedule();
    });
}

function isVisible(element) {
    return element.getClientRects().length > 0 && element.getBoundingClientRect().width > 0;
}

function paymentElementReady(element) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () =>
                finish(() =>
                    reject(
                        new Error(
                            "Le formulaire de paiement met trop de temps à charger. Réessayez dans quelques instants.",
                        ),
                    ),
                ),
            20_000,
        );
        const onReady = () => finish(resolve);
        const onLoadError = (event) =>
            finish(() =>
                reject(new Error(event?.error?.message || "Impossible de charger le formulaire de paiement.")),
            );
        const finish = (callback) => {
            clearTimeout(timeout);
            element.off("ready", onReady);
            element.off("loaderror", onLoadError);
            callback();
        };
        element.on("ready", onReady);
        element.on("loaderror", onLoadError);
    });
}

function headersObject(headers) {
    return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}

function errorMessage(error) {
    const message = error instanceof Error ? error.message.trim() : "";
    if (message === "SELLER_PROTECTED_PAYMENT_NOT_READY") {
        return "Cette annonce n’est pas disponible à l’achat pour le moment. Le vendeur doit finaliser l’activation de ses paiements.";
    }
    if (/insufficient funds/i.test(message)) {
        return "Le solde de la carte est insuffisant. Essaie un autre moyen de paiement.";
    }
    if (/card.*(?:declined|refused)|(?:declined|refused).*card/i.test(message)) {
        return "La carte a été refusée. Essaie un autre moyen de paiement.";
    }
    if (/expired card|card.*expired/i.test(message)) {
        return "La carte est expirée. Utilise une autre carte.";
    }
    if (/authentication|3d secure/i.test(message)) {
        return "L’authentification du paiement a échoué. Réessaie ou utilise une autre carte.";
    }
    return isFrenchUserMessage(message)
        ? message
        : "Le paiement n’a pas pu être traité. Réessaie ou utilise un autre moyen de paiement.";
}

function isFrenchUserMessage(value) {
    return (
        Boolean(value) &&
        /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|votre|vos|paiement|carte|commande|formulaire|réponse)\b/i.test(
            value,
        )
    );
}

function wait(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
}

function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceStripePayment);
