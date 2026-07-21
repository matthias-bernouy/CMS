class MondialRelayPicker extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return [
            "value",
            "disabled",
            "order-id",
            "postal-code",
            "city",
            "country",
            "weight-grams",
            "source-id",
            "source-prefix",
            "title",
            "copy",
            "button-label",
            "appearance",
            "accent-color",
            "background-color",
            "border-color",
            "text-color",
        ];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internalsRef = this.attachInternals();
        this.items = [];
        this.selectedItem = null;
        this.busy = false;
        this.formDisabled = false;
        this.defaultValue = null;
    }

    connectedCallback() {
        if (this.defaultValue === null) {
            this.defaultValue = this.getAttribute("value") || "";
        }
        this.render();
        this.syncPresentation();
        this.form.addEventListener("submit", this.onSubmit);
        this.postalCodeInput.addEventListener("input", this.onPostalCodeInput);
        this.clearButton.addEventListener("click", this.onClear);

        if (isFramed()) {
            this.renderPreview();
            this.setStatus(
                this.getAttribute("preview-label") || "La recherche Mondial Relay sera disponible sur la page publiée.",
                "idle",
            );
            return;
        }
        this.restoreSelection().catch((error) => {
            if (!isNotFound(error)) {
                this.fail(error);
            }
        });
    }

    disconnectedCallback() {
        this.form?.removeEventListener("submit", this.onSubmit);
        this.postalCodeInput?.removeEventListener("input", this.onPostalCodeInput);
        this.clearButton?.removeEventListener("click", this.onClear);
    }

    attributeChangedCallback(name, _oldValue, value) {
        if (name === "value") {
            this.internalsRef.setFormValue(value || "");
        }
        if (!this.isConnected || !this.form) {
            return;
        }
        this.syncPresentation(name);
        if (name === "order-id" && !isFramed()) {
            this.restoreSelection().catch((error) => {
                if (!isNotFound(error)) {
                    this.fail(error);
                }
            });
        }
    }

    get value() {
        return this.selectedItem?.location || this.getAttribute("value") || "";
    }

    set value(value) {
        this.setAttribute("value", value || "");
    }

    get name() {
        return this.getAttribute("name") || "";
    }

    get disabled() {
        return this.formDisabled || this.hasAttribute("disabled");
    }

    formDisabledCallback(disabled) {
        this.formDisabled = disabled;
        if (this.isConnected) {
            this.syncDisabled();
        }
    }

    formResetCallback() {
        this.selectedItem = null;
        if (this.defaultValue) {
            this.setAttribute("value", this.defaultValue);
        } else {
            this.removeAttribute("value");
        }
        this.internalsRef.setFormValue(this.defaultValue || "");
        if (!this.isConnected) {
            return;
        }
        this.selectedBox.hidden = true;
        this.list.replaceChildren();
        this.setStatus("", "idle");
    }

    focus() {
        this.postalCodeInput?.focus();
    }

    onSubmit = (event) => {
        event.preventDefault();
        this.search().catch((error) => this.fail(error));
    };

    onPostalCodeInput = () => this.syncPostalCodeValidity();

    onClear = () => this.clearForChange();

    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    --relay-accent: var(--primary-base, #16634d);
                    --relay-accent-text: var(--primary-contrasted, #ffffff);
                    --relay-background: var(--bg-surface, #ffffff);
                    --relay-border: var(--border-default, #dfddd4);
                    --relay-text: var(--text-main, #26261f);
                    display: block;
                    color: var(--relay-text);
                    font: inherit;
                }

                * { box-sizing: border-box; }

                .shell {
                    display: grid;
                    gap: 1rem;
                    padding: clamp(1rem, 3vw, 1.5rem);
                    border: 1px solid var(--relay-border);
                    border-radius: var(--radius-card, .75rem);
                    background: var(--relay-background);
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
                label,
                .list,
                .option-copy,
                .selected-copy {
                    display: grid;
                }

                .header { gap: .4rem; }
                h2, p { margin: 0; }
                h2 { font-size: 1.25rem; line-height: 1.2; }
                .muted, .address, .status { color: color-mix(in srgb, var(--relay-text) 68%, transparent); }

                form {
                    display: grid;
                    grid-template-columns: minmax(8rem, .7fr) minmax(10rem, 1fr) auto;
                    gap: .75rem;
                    align-items: end;
                }

                label { gap: .35rem; font-size: .925rem; font-weight: 700; }

                input,
                button {
                    min-height: 2.65rem;
                    border-radius: var(--radius-control, .375rem);
                    font: inherit;
                }

                input {
                    width: 100%;
                    padding: .6rem .75rem;
                    border: 1px solid var(--relay-border);
                    color: var(--relay-text);
                    background: var(--relay-background);
                }

                button {
                    padding: .6rem .9rem;
                    border: 1px solid var(--relay-accent);
                    color: var(--relay-accent-text);
                    background: var(--relay-accent);
                    cursor: pointer;
                    font-weight: 750;
                }

                button.secondary {
                    color: var(--relay-accent);
                    background: transparent;
                }

                input:focus-visible,
                button:focus-visible {
                    outline: 2px solid var(--relay-accent);
                    outline-offset: 2px;
                }

                button:disabled,
                input:disabled { cursor: wait; opacity: .65; }

                .list { gap: .65rem; }

                .option,
                .selected {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: .75rem;
                    align-items: center;
                    width: 100%;
                    padding: .85rem;
                    border: 1px solid var(--relay-border);
                    border-radius: var(--radius-card, .5rem);
                    color: var(--relay-text);
                    background: var(--relay-background);
                    text-align: start;
                }

                .option:hover { border-color: var(--relay-accent); }
                .option-copy, .selected-copy { gap: .2rem; }
                .option .choose { color: var(--relay-accent); font-weight: 750; }
                .selected { border-color: var(--relay-accent); }
                .selected[hidden], [hidden] { display: none !important; }
                .status { min-height: 1.25rem; font-size: .925rem; }
                .status:empty { display: none; }
                .status[data-state="error"] { color: var(--danger-base, #c4473d); }
                .status[data-state="success"] { color: var(--success-base, #21865f); }

                @media (max-width: 42rem) {
                    form { grid-template-columns: 1fr; }
                    form button { width: 100%; }
                    .option, .selected { grid-template-columns: 1fr; }
                }
            </style>
            <section class="shell">
                <div class="header">
                    <h2 data-title></h2>
                    <p class="muted" data-copy></p>
                </div>
                <form novalidate>
                    <label>
                        <span>Code postal</span>
                        <input name="postalCode" inputmode="numeric" autocomplete="postal-code" required>
                    </label>
                    <label>
                        <span>Ville</span>
                        <input name="city" autocomplete="address-level2">
                    </label>
                    <button type="submit" data-search></button>
                </form>
                <div class="selected" data-selected hidden>
                    <div class="selected-copy">
                        <strong data-selected-name></strong>
                        <span class="address" data-selected-address></span>
                    </div>
                    <button type="button" class="secondary" data-clear>Modifier</button>
                </div>
                <div class="list" data-list role="list"></div>
                <p class="status" data-status aria-live="polite"></p>
            </section>
        `;
    }

    syncPresentation(changedAttribute = "") {
        this.titleElement.textContent = this.getAttribute("title") || "Choisissez un point relais";
        this.copyElement.textContent =
            this.getAttribute("copy") || "Trouvez les points relais Mondial Relay disponibles près de chez vous.";
        this.searchButton.textContent = this.getAttribute("button-label") || "Rechercher";
        if (!changedAttribute || changedAttribute === "postal-code") {
            this.postalCodeInput.value = this.getAttribute("postal-code")?.trim() ?? "";
            this.syncPostalCodeValidity();
        }
        if (!changedAttribute || changedAttribute === "city") {
            this.cityInput.value = this.getAttribute("city")?.trim() ?? "";
        }
        for (const [attribute, property] of [
            ["accent-color", "--relay-accent"],
            ["background-color", "--relay-background"],
            ["border-color", "--relay-border"],
            ["text-color", "--relay-text"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
        this.syncDisabled();
    }

    syncPostalCodeValidity() {
        const input = this.postalCodeInput;
        input.setCustomValidity("");
        if (!input.value.trim()) {
            input.setCustomValidity("Le code postal est obligatoire.");
        }
        return input.validity.valid;
    }

    async search() {
        this.syncPostalCodeValidity();
        if (!this.form.reportValidity()) {
            return;
        }
        this.setBusy(true);
        this.setStatus("Recherche des points relais…", "idle");
        try {
            const url = new URL(`${this.sourceBase()}/relayPoints`, window.location.origin);
            url.searchParams.set("postalCode", this.postalCodeInput.value.trim());
            if (this.cityInput.value.trim()) {
                url.searchParams.set("city", this.cityInput.value.trim());
            }
            url.searchParams.set("country", this.country());
            url.searchParams.set("limit", this.getAttribute("limit") || "8");
            const weight = this.getAttribute("weight-grams")?.trim();
            if (weight) {
                url.searchParams.set("weightGrams", weight);
            }

            const data = await this.requestJson(url);
            this.items = Array.isArray(data.items) ? data.items.map(relayItem).filter(Boolean) : [];
            this.renderList();
            this.setStatus(
                this.items.length
                    ? `${this.items.length} point${this.items.length === 1 ? "" : "s"} relais disponible${this.items.length === 1 ? "" : "s"}.`
                    : "Aucun point relais trouvé.",
                "idle",
            );
        } finally {
            this.setBusy(false);
        }
    }

    renderList() {
        this.list.replaceChildren();
        for (const item of this.items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option";
            button.setAttribute("role", "listitem");
            const copy = document.createElement("span");
            copy.className = "option-copy";
            const title = document.createElement("strong");
            title.textContent = item.name;
            const address = document.createElement("span");
            address.className = "address";
            address.textContent = relayAddress(item);
            const choose = document.createElement("span");
            choose.className = "choose";
            choose.textContent = "Choisir";
            copy.append(title, address);
            button.append(copy, choose);
            button.addEventListener("click", () => {
                this.selectRelay(item).catch((error) => this.fail(error));
            });
            this.list.append(button);
        }
    }

    async selectRelay(item) {
        this.setBusy(true);
        this.setStatus(this.orderId() ? "Enregistrement du point relais…" : "", "idle");
        try {
            let selected = item;
            if (this.orderId()) {
                const result = await this.requestFunction("setRelayPointForOrder", {
                    method: "POST",
                    body: JSON.stringify({
                        orderId: this.orderId(),
                        relayLocation: item.location,
                        country: item.country,
                        postalCode: this.postalCodeInput.value.trim(),
                        city: this.cityInput.value.trim(),
                    }),
                });
                selected = relayItem(result?.selection || result) || item;
            }
            this.applySelection(selected, true);
            this.setStatus("Point relais sélectionné.", "success");
        } finally {
            this.setBusy(false);
        }
    }

    applySelection(item, emit) {
        this.selectedItem = item;
        this.setAttribute("value", item.location);
        this.internalsRef.setFormValue(item.location);
        this.selectedBox.hidden = false;
        this.selectedName.textContent = item.name;
        this.selectedAddress.textContent = relayAddress(item);
        this.list.replaceChildren();
        if (emit) {
            this.dispatchEvent(
                new CustomEvent("mondial-relay-picker:change", {
                    bubbles: true,
                    composed: true,
                    detail: {
                        ...item,
                        searchPostalCode: this.postalCodeInput.value.trim(),
                        searchCity: this.cityInput.value.trim(),
                        orderId: this.orderId() || null,
                    },
                }),
            );
            this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
    }

    clearForChange() {
        this.selectedItem = null;
        this.removeAttribute("value");
        this.internalsRef.setFormValue("");
        this.selectedBox.hidden = true;
        this.setStatus("Recherchez un autre point relais.", "idle");
    }

    async restoreSelection() {
        if (!this.orderId()) {
            return;
        }
        const selection = relayItem(
            await this.requestFunction("getRelayPointForOrder", {
                query: { orderId: this.orderId() },
            }),
        );
        if (selection) {
            this.applySelection(selection, false);
            this.setStatus("Point relais enregistré pour cette commande.", "success");
        }
    }

    renderPreview() {
        const first = relayItem({
            relayLocation: "FR-024474",
            name: "Point Relais République",
            addressLine1: "12 rue de la République",
            postalCode: "75001",
            city: "Paris",
            country: "FR",
        });
        if (!first) {
            return;
        }
        this.items = [first];
        this.renderList();
    }

    async requestFunction(id, options = {}) {
        const url = new URL(`/.cms/sources/system-functions/${encodeURIComponent(id)}`, window.location.origin);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
        return this.requestJson(url, options);
    }

    sourceBase() {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "delivery");
        return `${prefix}/${sourceId}`;
    }

    async requestJson(url, options = {}) {
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
            throw new HttpResponseError(response.status, errorMessageFromBody(body, response));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Réponse du service de livraison invalide.");
        }
        return body;
    }

    setBusy(value) {
        this.busy = value;
        this.syncDisabled();
    }

    syncDisabled() {
        for (const control of this.root.querySelectorAll("input, button")) {
            control.disabled = this.disabled || this.busy;
        }
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    fail(error) {
        this.setStatus(errorMessage(error), "error");
        this.setBusy(false);
    }

    country() {
        return (this.getAttribute("country")?.trim() || "FR").toUpperCase();
    }
    orderId() {
        return this.getAttribute("order-id")?.trim() || "";
    }
    get form() {
        return this.root.querySelector("form");
    }
    get titleElement() {
        return this.root.querySelector("[data-title]");
    }
    get copyElement() {
        return this.root.querySelector("[data-copy]");
    }
    get postalCodeInput() {
        return this.root.querySelector("[name='postalCode']");
    }
    get cityInput() {
        return this.root.querySelector("[name='city']");
    }
    get searchButton() {
        return this.root.querySelector("[data-search]");
    }
    get clearButton() {
        return this.root.querySelector("[data-clear]");
    }
    get selectedBox() {
        return this.root.querySelector("[data-selected]");
    }
    get selectedName() {
        return this.root.querySelector("[data-selected-name]");
    }
    get selectedAddress() {
        return this.root.querySelector("[data-selected-address]");
    }
    get list() {
        return this.root.querySelector("[data-list]");
    }
    get status() {
        return this.root.querySelector("[data-status]");
    }
}

class HttpResponseError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function relayItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const location = text(value.location) || text(value.relayLocation);
    const name = text(value.name);
    if (!location || !name) {
        return null;
    }
    return {
        location,
        number: text(value.number),
        country: text(value.country) || location.slice(0, 2),
        name,
        label: text(value.label) || name,
        addressLine1: text(value.addressLine1),
        addressLine2: text(value.addressLine2),
        postalCode: text(value.postalCode),
        city: text(value.city),
        latitude: finiteNumber(value.latitude),
        longitude: finiteNumber(value.longitude),
        nature: text(value.nature),
        pointType: text(value.pointType),
        warning: text(value.warning),
        shippingAmount: finiteNumber(value.shippingAmount),
        currency: text(value.currency),
    };
}

function relayAddress(item) {
    return [item.addressLine1, item.addressLine2, item.postalCode, item.city].filter(Boolean).join(", ");
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function headersObject(headers) {
    return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}

function errorMessage(error) {
    if (error instanceof HttpResponseError && error.status === 401) {
        return "Connecte-toi pour choisir un point relais.";
    }
    if (error instanceof HttpResponseError && error.status === 403) {
        return "Tu n’es pas autorisé à modifier ce point relais.";
    }
    const message = error instanceof Error ? error.message.trim() : "";
    return isFrenchUserMessage(message)
        ? message
        : "Impossible de rechercher des points relais pour le moment. Réessaie dans quelques instants.";
}

function errorMessageFromBody(body, response) {
    if (body && typeof body === "object" && "error" in body) {
        return String(body.error);
    }
    return `${response.status} ${response.statusText}`;
}

function isFrenchUserMessage(value) {
    return (
        Boolean(value) &&
        /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|relais|colis|livraison|commande|adresse|code postal|ville|réponse)\b/i.test(
            value,
        )
    );
}

function isNotFound(error) {
    return error instanceof HttpResponseError && error.status === 404;
}

function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MondialRelayPicker);
