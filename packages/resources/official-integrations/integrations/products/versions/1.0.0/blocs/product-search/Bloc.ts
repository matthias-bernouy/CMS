class ProductSearch extends HTMLElement {
    static formAssociated = true;
    static get observedAttributes() {
        return ["value", "label", "placeholder", "disabled", "source-id", "limit", "status", "visibility"];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internalsRef = this.attachInternals();
        this.input = null;
        this.labelEl = null;
        this.listbox = null;
        this.statusEl = null;
        this.clearButton = null;
        this.items = [];
        this.selectedValue = "";
        this.selectedLabel = "";
        this.activeIndex = -1;
        this.searchTimer = 0;
        this.requestKey = 0;
    }

    connectedCallback() {
        this.render();
        this.selectedValue = this.getAttribute("value") || this.selectedValue;
        this.syncAttributes();
        this.bind();
        if (this.selectedValue && !this.selectedLabel) this.loadSelected();
    }

    disconnectedCallback() {
        window.clearTimeout(this.searchTimer);
    }

    attributeChangedCallback(name, _oldValue, value) {
        if (name === "value") {
            this.value = value || "";
            return;
        }
        this.syncAttributes();
    }

    get value() {
        return this.selectedValue;
    }

    set value(value) {
        this.selectedValue = value || "";
        this.internalsRef.setFormValue(this.selectedValue);
        if (!this.selectedValue) this.selectedLabel = "";
        this.syncDisplay();
        if (this.selectedValue && !this.selectedLabel) this.loadSelected();
    }

    get name() {
        return this.getAttribute("name") || "";
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(value) {
        value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }

    focus() {
        this.input?.focus();
    }

    render() {
        this.root.innerHTML = `
            <style>
                :host { display: block; font: inherit; color: inherit; }
                .field { display: grid; gap: .375rem; position: relative; }
                label {
                    color: color-mix(in srgb, currentColor 56%, transparent);
                    font-size: .75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                }
                label[hidden], button[hidden], [role="listbox"][hidden] { display: none; }
                .control { position: relative; }
                input {
                    box-sizing: border-box;
                    width: 100%;
                    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
                    border-radius: .5rem;
                    background: Canvas;
                    color: currentColor;
                    font: inherit;
                    min-height: 2.5rem;
                    padding: .5rem 2.25rem .5rem .75rem;
                    outline: none;
                }
                input:focus-visible {
                    border-color: color-mix(in srgb, currentColor 44%, transparent);
                    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
                }
                input:disabled { opacity: .6; cursor: not-allowed; }
                button {
                    position: absolute;
                    inset-block-start: 50%;
                    inset-inline-end: .45rem;
                    transform: translateY(-50%);
                    display: inline-grid;
                    width: 1.75rem;
                    height: 1.75rem;
                    place-items: center;
                    border: 0;
                    border-radius: 999px;
                    background: transparent;
                    color: color-mix(in srgb, currentColor 64%, transparent);
                    cursor: pointer;
                    font: inherit;
                    padding: 0;
                }
                button:hover {
                    background: color-mix(in srgb, currentColor 8%, transparent);
                    color: currentColor;
                }
                [role="listbox"] {
                    position: absolute;
                    z-index: 20;
                    inset-inline: 0;
                    inset-block-start: calc(100% + .25rem);
                    max-height: 16rem;
                    overflow: auto;
                    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
                    border-radius: .5rem;
                    background: Canvas;
                    box-shadow: 0 .75rem 1.75rem color-mix(in srgb, currentColor 14%, transparent);
                    padding: .25rem;
                }
                [role="option"], .empty {
                    display: grid;
                    border-radius: .375rem;
                    padding: .55rem .65rem;
                }
                [role="option"] { cursor: pointer; }
                [role="option"][aria-selected="true"], [role="option"]:hover {
                    background: color-mix(in srgb, currentColor 8%, transparent);
                }
                .title { font-weight: 700; }
                .empty, .status {
                    color: color-mix(in srgb, currentColor 62%, transparent);
                    font-size: .875rem;
                }
                .status[data-state="error"] { color: #b42318; }
            </style>
            <div class="field">
                <label></label>
                <div class="control">
                    <input type="search" autocomplete="off" role="combobox" aria-expanded="false">
                    <button type="button" aria-label="Clear" hidden>&times;</button>
                    <div role="listbox" hidden></div>
                </div>
                <div class="status" data-status></div>
            </div>
        `;
        this.input = this.root.querySelector("input");
        this.labelEl = this.root.querySelector("label");
        this.listbox = this.root.querySelector("[role='listbox']");
        this.statusEl = this.root.querySelector("[data-status]");
        this.clearButton = this.root.querySelector("button");
    }

    bind() {
        this.input?.addEventListener("focus", this.onFocus);
        this.input?.addEventListener("input", this.onInput);
        this.input?.addEventListener("keydown", this.onKeydown);
        this.input?.addEventListener("blur", this.onBlur);
        this.clearButton?.addEventListener("mousedown", this.onClear);
    }

    syncAttributes() {
        if (this.labelEl) {
            const label = this.getAttribute("label") || "";
            this.labelEl.textContent = label;
            this.labelEl.hidden = !label;
        }
        if (this.input) {
            this.input.placeholder = this.getAttribute("placeholder") || "Search products";
            this.input.disabled = this.disabled;
        }
        this.syncDisplay();
    }

    syncDisplay() {
        if (this.input && this.root.activeElement !== this.input) this.input.value = this.selectedLabel;
        if (this.clearButton) this.clearButton.hidden = !this.selectedValue && !this.selectedLabel;
        this.internalsRef.setFormValue(this.selectedValue);
    }

    onFocus = () => {
        this.search(this.input?.value.trim() || "");
    };

    onInput = () => {
        const query = this.input?.value.trim() || "";
        if (query !== this.selectedLabel) {
            this.selectedValue = "";
            this.internalsRef.setFormValue("");
        }
        this.activeIndex = -1;
        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => this.search(query), 180);
    };

    onBlur = () => {
        window.setTimeout(() => {
            this.hideList();
            this.syncDisplay();
        }, 140);
    };

    onClear = event => {
        event.preventDefault();
        this.selectProduct({ id: "", title: "" });
        this.input?.focus();
    };

    onKeydown = event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (this.listbox?.hidden) this.search(this.input?.value.trim() || "");
            const step = event.key === "ArrowDown" ? 1 : -1;
            this.activeIndex = Math.max(0, Math.min(this.items.length - 1, this.activeIndex + step));
            this.renderList();
            return;
        }
        if (event.key === "Enter") {
            const item = this.items[this.activeIndex];
            if (!item) return;
            event.preventDefault();
            this.selectProduct(item);
        }
        if (event.key === "Escape") {
            event.preventDefault();
            this.hideList();
            this.syncDisplay();
        }
    };

    async search(query) {
        const key = ++this.requestKey;
        this.setStatus(query ? "Searching..." : "", "idle");
        try {
            const data = await this.requestProducts(query);
            if (key !== this.requestKey) return;
            this.items = Array.isArray(data.items) ? data.items.map(productItem).filter(Boolean) : [];
            this.renderList();
            this.setStatus("", "idle");
        } catch (error) {
            if (key !== this.requestKey) return;
            this.items = [];
            this.renderList();
            this.setStatus(errorMessage(error), "error");
        }
    }

    async loadSelected() {
        try {
            const data = await this.requestProduct(this.selectedValue);
            const item = productItem(data);
            if (!item) return;
            this.selectedLabel = item.title;
            this.syncDisplay();
        } catch {
            this.selectedLabel = this.selectedValue;
            this.syncDisplay();
        }
    }

    renderList() {
        if (!this.listbox) return;
        this.listbox.replaceChildren();
        if (!this.items.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No products found.";
            this.listbox.append(empty);
        } else {
            this.items.forEach((item, index) => {
                const option = document.createElement("div");
                option.id = `product-option-${index}`;
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", String(index === this.activeIndex));
                const title = document.createElement("span");
                title.className = "title";
                title.textContent = item.title;
                option.append(title);
                option.addEventListener("mousedown", event => {
                    event.preventDefault();
                    this.selectProduct(item);
                });
                this.listbox.append(option);
            });
        }
        this.listbox.hidden = false;
        this.input?.setAttribute("aria-expanded", "true");
        if (this.activeIndex >= 0) this.input?.setAttribute("aria-activedescendant", `product-option-${this.activeIndex}`);
    }

    selectProduct(item) {
        this.selectedValue = item.id;
        this.selectedLabel = item.title;
        if (this.input) this.input.value = this.selectedLabel;
        this.internalsRef.setFormValue(this.selectedValue);
        this.hideList();
        this.syncDisplay();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    hideList() {
        if (this.listbox) this.listbox.hidden = true;
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
    }

    async requestProducts(query) {
        const url = this.sourceUrl("products");
        if (query) url.searchParams.set("q", query);
        url.searchParams.set("limit", this.getAttribute("limit") || "10");
        for (const name of ["status", "visibility"]) {
            const value = this.getAttribute(name);
            if (value) url.searchParams.set(name, value);
        }
        return await this.requestJson(url);
    }

    async requestProduct(id) {
        const url = this.sourceUrl("product");
        url.searchParams.set("id", id);
        return await this.requestJson(url);
    }

    sourceUrl(endpoint) {
        const prefix = this.getAttribute("source-prefix") || "/.cms/sources";
        const sourceId = this.getAttribute("source-id") || "products";
        return new URL(`${prefix.replace(/\/+$/, "")}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`, window.location.origin);
    }

    async requestJson(url) {
        const response = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessageFromBody(body, response));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid source response.");
        return body;
    }

    setStatus(message, state) {
        if (!this.statusEl) return;
        this.statusEl.textContent = message;
        this.statusEl.dataset.state = state;
    }
}

function productItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = value.id == null ? "" : String(value.id);
    const title = typeof value.title === "string" ? value.title : "";
    if (!id || !title) return null;
    return {
        id,
        title,
        ...(typeof value.slug === "string" ? { slug: value.slug } : {}),
        ...(typeof value.status === "string" ? { status: value.status } : {}),
    };
}

function errorMessage(error) {
    return error instanceof Error ? error.message : "Unable to search products.";
}

function errorMessageFromBody(body, response) {
    if (body && typeof body === "object" && "error" in body) return String(body.error);
    return `${response.status} ${response.statusText}`;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", ProductSearch);
