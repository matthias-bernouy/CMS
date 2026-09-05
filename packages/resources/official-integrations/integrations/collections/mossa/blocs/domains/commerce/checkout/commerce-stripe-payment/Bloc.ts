import {
    acceptedLegalDocumentVersionIds,
    errorCode,
    isLegalRequirementsRefreshError,
    LEGAL_ACCEPTANCE_REQUIRED,
    LEGAL_DOCUMENT_NOT_AVAILABLE,
    LEGAL_DOCUMENT_VERSION_CHANGED,
    normalizeLegalRequirements,
    renderLegalRequirements,
} from "./legal-consent";

const functionPaths = {
    createPaymentForOrder: "/.cms/sources/system-functions/createPaymentForOrder",
    getPaymentLegalRequirements: "/.cms/sources/system-functions/getPaymentLegalRequirements",
    getStripePaymentClientConfig: "/.cms/sources/system-functions/getStripePaymentClientConfig",
    refreshPaymentForOrder: "/.cms/sources/system-functions/refreshPaymentForOrder",
};
import legalStyle from "./legal-style.css" with { type: "text" };

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
            "appearance",
            "legal-appearance",
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
        this.legalRequirements = null;
        this.legalRequirementsSignature = null;
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
                this.getAttribute("preview-label") || "The secure payment form will appear on the published page.",
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
            this.resetLegalRequirements();
        }
        this.syncPresentation();
        if (name === "layout") {
            this.paymentElement?.update({ layout: { type: this.paymentLayout() } });
            return;
        }
        if (name === "legal-appearance") {
            this.renderLegalRequirements();
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
                ${legalStyle}

                :host {
                    --_mossa-payment-accent: var(--ulvia-primary-base);
                    --_mossa-payment-accent-foreground: var(--ulvia-primary-foreground);
                    --_mossa-payment-background: var(--ulvia-surface-background);
                    --_mossa-payment-border: var(--ulvia-surface-border);
                    --_mossa-payment-text: var(--ulvia-body-text);
                    display: block;
                    color: var(--_mossa-payment-text);
                    font-family: inherit;
                }

                * { box-sizing: border-box; }

                .shell {
                    display: grid;
                    gap: 1.25rem;
                    padding: clamp(1rem, 3vw, 1.5rem);
                    border: 1px solid var(--_mossa-payment-border);
                    border-radius: var(--ulvia-radius-card);
                    background: var(--_mossa-payment-background);
                    box-shadow: var(--ulvia-shadow-soft);
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
                    color: color-mix(in srgb, var(--_mossa-payment-text) 68%, transparent);
                }

                .summary {
                    grid-template-columns: 1fr auto;
                    gap: .75rem;
                    align-items: baseline;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--_mossa-payment-border);
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
                    border: 1px solid var(--_mossa-payment-border);
                    border-radius: var(--ulvia-radius-control);
                    color: color-mix(in srgb, var(--_mossa-payment-text) 52%, transparent);
                    background: var(--_mossa-payment-background);
                }

                button {
                    width: 100%;
                    min-height: 2.75rem;
                    padding: .72rem 1rem;
                    border: 1px solid var(--_mossa-payment-accent);
                    border-radius: var(--ulvia-radius-control);
                    color: var(--_mossa-payment-accent-foreground);
                    background: var(--_mossa-payment-accent);
                    font: inherit;
                    font-weight: 750;
                    cursor: pointer;
                }

                button:focus-visible {
                    outline: 2px solid var(--_mossa-payment-accent);
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
                .status[data-state="error"] { color: var(--ulvia-danger-base); }
                .status[data-state="success"] { color: var(--ulvia-success-base); }
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
                    <fieldset class="legal" data-legal-region hidden>
                        <legend>Contractual terms</legend>
                        <div class="legal-documents" data-legal-documents></div>
                    </fieldset>
                    <div data-payment-region>
                        <slot name="stripe-payment-element"></slot>
                    </div>
                    <div class="preview" data-preview hidden aria-hidden="true">
                        <span>Card number</span>
                        <span>MM / AA</span>
                        <span>CVC</span>
                    </div>
                    <div class="security">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <rect x="4.5" y="10" width="15" height="10" rx="2"></rect>
                            <path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path>
                            <path d="M12 14v2.5"></path>
                        </svg>
                        <span>Encrypted payment. Card details never pass through our servers.</span>
                    </div>
                    <button type="submit" data-submit disabled></button>
                    <p class="status" data-status aria-live="polite"></p>
                </form>
            </section>
        `;
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();
            this.submitPayment().catch((error) => this.handlePaymentError(error));
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
        this.title.textContent = this.getAttribute("title") || "Secure payment";
        this.copy.textContent = this.getAttribute("copy") || "Choose a payment method and confirm the order.";
        this.descriptionElement.textContent = this.getAttribute("summary-label") || "Order total";
        this.amountElement.textContent = amount ? formatAmount(amount.amountTotal, amount.currency) : "—";
        this.syncSubmitLabel(amount);
    }

    scheduleInitialize() {
        clearTimeout(this.initializeTimer);
        this.initializeTimer = setTimeout(() => {
            this.initialize().catch((error) => this.handlePaymentError(error));
        }, 25);
    }

    syncSubmitLabel(amount = trustedPaymentAmount(this.payment)) {
        if (this.legalRequirements?.enabled && !this.elements && !this.paymentSubmissionLocked) {
            this.submitButton.textContent = "Continue to payment";
            return;
        }
        this.submitButton.textContent =
            this.getAttribute("button-label") ||
            (amount ? `Payer ${formatAmount(amount.amountTotal, amount.currency)}` : "Payer");
    }

    renderLegalRequirements() {
        const requirements = this.legalRequirements || { enabled: false, documents: [] };
        renderLegalRequirements(
            this,
            this.legalDocuments,
            requirements,
            () => {
                if (this.status.dataset.errorCode === LEGAL_ACCEPTANCE_REQUIRED) {
                    this.setStatus("", "idle");
                    delete this.status.dataset.errorCode;
                }
            },
            this.legalAppearance(),
        );
        this.legalRegion.hidden = !requirements.enabled;
    }

    resetLegalRequirements() {
        this.legalRequirements = null;
        this.legalRequirementsSignature = null;
        this.initializedSignature = null;
        this.paymentElement?.destroy();
        this.paymentElement = null;
        this.elements = null;
        this.stripe = null;
        this.payment = null;
        this.legalDocuments?.replaceChildren();
        for (const link of this.querySelectorAll(":scope > a[data-commerce-payment-legal-link]")) {
            link.remove();
        }
        if (this.legalRegion) {
            this.legalRegion.hidden = true;
        }
        if (this.paymentRegion) {
            this.paymentRegion.hidden = false;
        }
    }

    async initialize() {
        const input = this.readPaymentInput(true);
        const signature = JSON.stringify(input);
        if (signature === this.initializedSignature && this.elements) {
            return;
        }

        this.submitButton.disabled = true;
        this.setStatus("Checking contractual terms…", "idle");
        const requirements = normalizeLegalRequirements(
            await this.requestFunction("getPaymentLegalRequirements", {
                query: { orderId: input.orderId },
            }),
        );
        if (JSON.stringify(this.readPaymentInput(false)) !== signature) {
            this.scheduleInitialize();
            return;
        }
        this.legalRequirements = requirements;
        this.legalRequirementsSignature = signature;
        this.renderLegalRequirements();
        if (requirements.enabled) {
            this.paymentRegion.hidden = true;
            this.submitButton.disabled = false;
            this.syncSubmitLabel();
            this.setStatus("", "idle");
            return;
        }
        await this.initializePayment(input, signature, []);
    }

    async initializePayment(input, signature, acceptedVersionIds) {
        this.submitButton.disabled = true;
        this.setStatus("Preparing secure payment…", "idle");
        const payment = await this.requestFunction("createPaymentForOrder", {
            method: "POST",
            body: JSON.stringify({
                ...input,
                acceptedLegalDocumentVersionIds: acceptedVersionIds,
            }),
        });
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
            throw new Error("The payment service did not return a valid session.");
        }

        this.paymentRegion.hidden = false;
        await waitUntilVisible(this);

        const [Stripe, config] = await Promise.all([loadStripeJs(), this.clientConfig()]);
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
        this.setStatus("Loading payment form…", "idle");
        await ready;
        this.initializedSignature = signature;
        this.submitButton.disabled = false;
        this.syncSubmitLabel();
        this.setStatus("", "idle");
        this.dispatch("ready", { paymentId: payment.paymentId });
        await this.applyRedirectResult(payment.clientSecret);
    }

    async submitPayment() {
        if (!this.elements) {
            const input = this.readPaymentInput(true);
            const signature = JSON.stringify(input);
            if (!this.legalRequirements || this.legalRequirementsSignature !== signature) {
                await this.initialize();
                return;
            }
            const acceptedVersionIds = acceptedLegalDocumentVersionIds(this.legalDocuments, this.legalRequirements);
            await this.initializePayment(input, signature, acceptedVersionIds);
            return;
        }
        await this.confirm();
    }

    async handlePaymentError(error) {
        if (!isLegalRequirementsRefreshError(error)) {
            this.fail(error);
            return;
        }
        this.resetLegalRequirements();
        try {
            await this.initialize();
            this.setStatus("Contractual terms changed. Review and accept the new version.", "error");
        } catch (refreshError) {
            this.fail(refreshError);
        }
    }

    async confirm() {
        if (!this.stripe || !this.elements || !this.payment) {
            throw new Error("Payment is not ready yet.");
        }
        this.submitButton.disabled = true;
        this.setStatus("Confirming payment…", "idle");
        const result = await this.stripe.confirmPayment({
            elements: this.elements,
            confirmParams: { return_url: this.returnUrl(this.payment.paymentId) },
            redirect: "if_required",
        });
        if (result.error) {
            throw new Error(result.error.message || "Payment was declined.");
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
            throw new Error(result.error.message || "Payment could not be retrieved.");
        }
        await this.completePayment(result.paymentIntent);
    }

    async completePayment(paymentIntent) {
        if (paymentIntent?.status === "requires_payment_method" || paymentIntent?.status === "canceled") {
            this.submitButton.disabled = false;
            throw new Error("Payment could not be confirmed.");
        }
        this.paymentSubmissionLocked = true;
        this.setStatus("Verifying payment securely…", "idle");
        const payment = await this.refreshPaymentUntilSettled();
        this.payment = payment;
        this.syncPresentation();
        if (!this.presentExistingPayment(payment)) {
            throw new Error("Payment could not be confirmed.");
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
            this.setStatus(this.getAttribute("success-label") || "Payment confirmed. Thank you!", "success");
            this.lockPaymentSubmission();
            this.dispatch("success", payment);
            return true;
        }
        if (state === "processing") {
            this.setStatus("Payment received and under review.", "idle");
            this.lockPaymentSubmission();
            this.dispatch("processing", payment);
            return true;
        }
        if (state === "refunded" || state === "partially_refunded") {
            this.setStatus(state === "refunded" ? "Payment refunded." : "Payment partially refunded.", "idle");
            this.lockPaymentSubmission();
            this.dispatch("refund", payment);
            return true;
        }
        if (state === "disputed" || state === "manual_review") {
            this.setStatus("Payment temporarily held for review.", "idle");
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
                    throw new Error("Payment service configuration is incomplete.");
                }
                return config;
            });
        }
        return this.clientConfigPromise;
    }

    async requestFunction(id, options = {}) {
        const path = functionPaths[id];
        if (!path) {
            throw new Error(`Undeclared payment function: ${id}`);
        }
        return this.requestJson(path, options);
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
            const code =
                body && typeof body === "object" && "error" in body
                    ? String(body.error)
                    : `${response.status} ${response.statusText}`;
            throw new CmsFunctionRequestError(code, response.status);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Invalid payment response.");
        }
        return body;
    }

    readPaymentInput(required) {
        const orderId = Number(this.getAttribute("order-id")?.trim());
        if (!Number.isSafeInteger(orderId) || orderId < 1) {
            if (required) {
                throw new Error("The payment block must be associated with a valid order.");
            }
            return null;
        }
        return { orderId };
    }

    stripeAppearance() {
        return {
            theme: "stripe",
            variables: {
                colorPrimary: this.resolveColor("--ulvia-primary-base", "#16634d"),
                colorBackground: this.resolveColor("--ulvia-surface-background", "#ffffff"),
                colorText: this.resolveColor("--ulvia-body-text", "#26261f"),
                colorDanger: this.resolveColor("--ulvia-danger-base", "#c4473d"),
                colorSuccess: this.resolveColor("--ulvia-success-base", "#21865f"),
                fontFamily: getComputedStyle(this).fontFamily,
                borderRadius: getComputedStyle(this).getPropertyValue("--ulvia-radius-control").trim() || "6px",
            },
            rules: {
                ".Input": {
                    borderColor: this.resolveColor("--ulvia-surface-border", "#dfddd4"),
                },
            },
        };
    }

    resolveColor(variable, fallback) {
        const probe = document.createElement("span");
        probe.style.color = `var(${variable}, ${fallback})`;
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

    legalAppearance() {
        return this.getAttribute("legal-appearance") === "compact" ? "compact" : "detailed";
    }

    returnUrl(paymentId) {
        const value = this.getAttribute("return-url")?.trim() || window.location.href;
        const url = new URL(value, window.location.href);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("The payment return URL is invalid.");
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
        const legalAcceptanceCanRetry = Boolean(
            input && this.legalRequirements?.enabled && JSON.stringify(input) === this.legalRequirementsSignature,
        );
        this.submitButton.disabled = this.paymentSubmissionLocked || (!currentFormIsUsable && !legalAcceptanceCanRetry);
        this.syncSubmitLabel();
        this.status.dataset.errorCode = errorCode(error);
        this.setStatus(errorMessage(error), "error");
        this.dispatch("error", { message: errorMessage(error) });
    }

    dispatch(name, detail) {
        this.dispatchEvent(
            new CustomEvent(`mossa-commerce-stripe-payment:${name}`, {
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
    get legalRegion() {
        return this.root.querySelector("[data-legal-region]");
    }
    get legalDocuments() {
        return this.root.querySelector("[data-legal-documents]");
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
        const locale = document.documentElement.lang || navigator.language || "en-US";
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
                    reject(new Error("The payment service is unavailable."));
                }
            },
            { once: true },
        );
        script.addEventListener("error", () => reject(new Error("The payment service could not be loaded.")), {
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
            finish(() => reject(new Error("The payment form cannot be displayed.")));
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
            () => finish(() => reject(new Error("The payment form is taking too long to load. Try again shortly."))),
            20_000,
        );
        const onReady = () => finish(resolve);
        const onLoadError = (event) =>
            finish(() => reject(new Error(event?.error?.message || "The payment form could not be loaded.")));
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

class CmsFunctionRequestError extends Error {
    constructor(code, status) {
        super(code);
        this.name = "CmsFunctionRequestError";
        this.code = code;
        this.status = status;
    }
}

function errorMessage(error) {
    const message = errorCode(error);
    if (message === LEGAL_ACCEPTANCE_REQUIRED) {
        return "Accept all contractual terms to continue.";
    }
    if (message === LEGAL_DOCUMENT_VERSION_CHANGED) {
        return "Contractual terms changed. Review them before continuing.";
    }
    if (message === LEGAL_DOCUMENT_NOT_AVAILABLE) {
        return "Contractual terms are temporarily unavailable. Payment cannot start.";
    }
    if (message === "SELLER_PROTECTED_PAYMENT_NOT_READY") {
        return "This offer is not currently available for purchase. The seller must complete payment activation.";
    }
    if (/insufficient funds/i.test(message)) {
        return "The card has insufficient funds. Try another payment method.";
    }
    if (/card.*(?:declined|refused)|(?:declined|refused).*card/i.test(message)) {
        return "The card was declined. Try another payment method.";
    }
    if (/expired card|card.*expired/i.test(message)) {
        return "The card expired. Use another card.";
    }
    if (/authentication|3d secure/i.test(message)) {
        return "Payment authentication failed. Try again or use another card.";
    }
    return "Payment could not be processed. Try again or use another payment method.";
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
