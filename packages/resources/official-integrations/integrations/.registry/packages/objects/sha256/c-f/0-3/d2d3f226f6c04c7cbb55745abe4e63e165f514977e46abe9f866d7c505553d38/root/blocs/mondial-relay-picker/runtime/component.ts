import { isFramed, isNotFound } from "./helpers";
import { OperationalPicker } from "./operations";

export class MondialRelayPicker extends OperationalPicker {
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
            "change-label",
            "selection-label",
            "auto-search",
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
        this.autoSearchScheduled = false;
        this.lastAutoSearchKey = "";
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
        void this.initialize();
    }

    disconnectedCallback() {
        this.form?.removeEventListener("submit", this.onSubmit);
        this.postalCodeInput?.removeEventListener("input", this.onPostalCodeInput);
        this.clearButton?.removeEventListener("click", this.onClear);
        this.autoSearchScheduled = false;
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
            void this.initialize();
        } else if (["postal-code", "city", "auto-search"].includes(name) && !isFramed()) {
            this.scheduleAutoSearch();
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

    async initialize() {
        try {
            await this.restoreSelection();
        } catch (error) {
            if (!isNotFound(error)) {
                this.fail(error);
            }
        }
        if (!this.selectedItem) {
            this.scheduleAutoSearch();
        }
    }

    scheduleAutoSearch() {
        if (
            this.getAttribute("auto-search") === "false" ||
            !this.postalCodeInput?.value.trim() ||
            !this.cityInput?.value.trim() ||
            this.selectedItem ||
            this.autoSearchScheduled
        ) {
            return;
        }
        this.autoSearchScheduled = true;
        queueMicrotask(() => {
            this.autoSearchScheduled = false;
            if (!this.isConnected || this.selectedItem) {
                return;
            }
            const key = [
                this.postalCodeInput.value.trim(),
                this.cityInput.value.trim(),
                this.country(),
                this.getAttribute("weight-grams")?.trim() || "",
            ].join("|");
            if (key === this.lastAutoSearchKey) {
                return;
            }
            this.lastAutoSearchKey = key;
            this.search().catch((error) => this.fail(error));
        });
    }

    onSubmit = (event) => {
        event.preventDefault();
        this.search().catch((error) => this.fail(error));
    };

    onPostalCodeInput = () => this.syncPostalCodeValidity();

    onClear = () => this.clearForChange();
}
