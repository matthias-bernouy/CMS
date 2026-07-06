class MondialRelayPicker extends HTMLElement {
    static formAssociated = true;
    static get observedAttributes() {
        return ["value", "disabled"];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internalsRef = this.attachInternals();
        this.items = [];
        this.selectedValue = "";
        this.selectedLabel = "";
    }

    connectedCallback() {
        this.render();
        this.selectedValue = this.getAttribute("value") || "";
        this.internalsRef.setFormValue(this.selectedValue);
        this.form.addEventListener("submit", event => {
            event.preventDefault();
            this.search().catch(error => this.setStatus(errorMessage(error), "error"));
        });
        this.clearButton.addEventListener("click", () => this.selectRelay(null));
    }

    attributeChangedCallback(name, _oldValue, value) {
        if (name === "value") {
            this.selectedValue = value || "";
            this.internalsRef.setFormValue(this.selectedValue);
        }
        if (this.isConnected) this.syncDisabled();
    }

    get value() {
        return this.selectedValue;
    }

    set value(value) {
        this.selectedValue = value || "";
        this.internalsRef.setFormValue(this.selectedValue);
    }

    get name() {
        return this.getAttribute("name") || "";
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    focus() {
        this.postalCodeInput?.focus();
    }

    render() {
        const title = this.getAttribute("title") || "Pickup point";
        const buttonLabel = this.getAttribute("button-label") || "Search";

        this.root.innerHTML = `
            <style>
                :host { display: block; font: inherit; color: inherit; }
                .shell {
                    display: grid;
                    gap: .8rem;
                    max-width: 44rem;
                }
                h2 { margin: 0; font-size: 1.25rem; line-height: 1.2; }
                form {
                    display: grid;
                    gap: .75rem;
                    grid-template-columns: minmax(8rem, .7fr) minmax(10rem, 1fr) minmax(6rem, .4fr) auto;
                    align-items: end;
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
                button {
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
                button.secondary {
                    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
                    background: transparent;
                    color: currentColor;
                }
                input:focus-visible, button:focus-visible {
                    outline: 2px solid currentColor;
                    outline-offset: 2px;
                }
                button:disabled, input:disabled { cursor: not-allowed; opacity: .65; }
                .selected {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: .75rem;
                    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
                    border-radius: .5rem;
                    padding: .65rem .75rem;
                }
                .selected[hidden] { display: none; }
                .list {
                    display: grid;
                    gap: .45rem;
                }
                .option {
                    display: grid;
                    gap: .15rem;
                    width: 100%;
                    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
                    border-radius: .5rem;
                    background: Canvas;
                    color: currentColor;
                    text-align: start;
                }
                .option strong { font-size: 1rem; }
                .option span, .status { color: color-mix(in srgb, currentColor 66%, transparent); }
                .status[data-state="error"] { color: #b42318; }
                @media (max-width: 680px) {
                    form { grid-template-columns: 1fr; }
                    button { width: 100%; }
                }
            </style>
            <section class="shell">
                <h2>${escapeHtml(title)}</h2>
                <form>
                    <label>
                        <span>Postal code</span>
                        <input name="postalCode" autocomplete="postal-code" required>
                    </label>
                    <label>
                        <span>City</span>
                        <input name="city" autocomplete="address-level2">
                    </label>
                    <label>
                        <span>Country</span>
                        <input name="country" value="FR" maxlength="2">
                    </label>
                    <button type="submit">${escapeHtml(buttonLabel)}</button>
                </form>
                <div class="selected" data-selected hidden>
                    <strong data-selected-label></strong>
                    <button type="button" class="secondary" data-clear>Clear</button>
                </div>
                <div class="list" data-list></div>
                <p class="status" data-status></p>
            </section>
        `;
        this.syncDisabled();
    }

    async search() {
        this.searchButton.disabled = true;
        this.setStatus(this.getAttribute("loading-label") || "Searching...", "idle");
        try {
            const url = this.sourceUrl("relayPoints");
            url.searchParams.set("postalCode", this.postalCodeInput.value.trim());
            if (this.cityInput.value.trim()) url.searchParams.set("city", this.cityInput.value.trim());
            url.searchParams.set("country", (this.countryInput.value.trim() || "FR").toUpperCase());
            url.searchParams.set("limit", this.getAttribute("limit") || "8");
            const weight = this.getAttribute("weight-grams");
            if (weight) url.searchParams.set("weightGrams", weight);

            const data = await this.requestJson(url);
            this.items = Array.isArray(data.items) ? data.items.map(relayItem).filter(Boolean) : [];
            this.renderList();
            this.setStatus(this.items.length ? "" : "No pickup point found.", "idle");
        } finally {
            this.searchButton.disabled = false;
        }
    }

    renderList() {
        this.list.replaceChildren();
        for (const item of this.items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option";
            const title = document.createElement("strong");
            title.textContent = item.name;
            const address = document.createElement("span");
            address.textContent = item.address;
            button.append(title, address);
            button.addEventListener("click", () => this.selectRelay(item));
            this.list.append(button);
        }
    }

    selectRelay(item) {
        this.selectedValue = item?.location || "";
        this.selectedLabel = item?.label || "";
        this.internalsRef.setFormValue(this.selectedValue);
        this.selectedBox.hidden = !item;
        this.selectedLabelEl.textContent = this.selectedLabel;
        if (item) this.list.replaceChildren();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    async requestJson(url) {
        const response = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessageFromBody(body, response));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid source response.");
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        const sourceId = this.getAttribute("source-id") || "delivery";
        return new URL(`${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`, window.location.origin);
    }

    syncDisabled() {
        for (const control of this.root.querySelectorAll("input, button")) control.disabled = this.disabled;
    }

    setStatus(message, state) {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    get form() {
        return this.root.querySelector("form");
    }

    get postalCodeInput() {
        return this.root.querySelector("input[name='postalCode']");
    }

    get cityInput() {
        return this.root.querySelector("input[name='city']");
    }

    get countryInput() {
        return this.root.querySelector("input[name='country']");
    }

    get searchButton() {
        return this.root.querySelector("button[type='submit']");
    }

    get clearButton() {
        return this.root.querySelector("[data-clear]");
    }

    get selectedBox() {
        return this.root.querySelector("[data-selected]");
    }

    get selectedLabelEl() {
        return this.root.querySelector("[data-selected-label]");
    }

    get list() {
        return this.root.querySelector("[data-list]");
    }

    get status() {
        return this.root.querySelector("[data-status]");
    }
}

function relayItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const location = value.location == null ? "" : String(value.location);
    const name = typeof value.name === "string" ? value.name : "";
    const label = typeof value.label === "string" ? value.label : name;
    const postalCode = typeof value.postalCode === "string" ? value.postalCode : "";
    const city = typeof value.city === "string" ? value.city : "";
    const addressLine1 = typeof value.addressLine1 === "string" ? value.addressLine1 : "";
    if (!location || !name) return null;
    return {
        location,
        name,
        label,
        address: [addressLine1, postalCode, city].filter(Boolean).join(", "),
    };
}

function errorMessage(error) {
    return error instanceof Error ? error.message : "Unable to search pickup points.";
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

customElements.define("BE5_TAG_TO_BE_REPLACED", MondialRelayPicker);
