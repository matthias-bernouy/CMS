import { SchemaOfferFilters } from "./schema";
import { NumericRangeFilters } from "./range-controller";

export class CommerceOfferFilter extends HTMLElement {
    static observedAttributes = [
        "category-param",
        "schema-endpoint",
        "schema-driven",
        "show-brand",
        "source-id",
        "source-prefix",
    ];

    constructor() {
        super();
        this.schemaFilters = null;
        this.numericRangeFilters = null;
        this.authoredContent = null;
        this.schemaModeActive = false;
    }

    connectedCallback() {
        this.setAttribute("data-commerce-offer-filter", "");
        if (this.hasAttribute("data-numeric-range")) {
            this.style.display = "grid";
            this.numericRangeFilters ||= new NumericRangeFilters(this);
            this.numericRangeFilters.connect();
            return;
        }
        if (!this.schemaDriven) {
            this.style.display = "contents";
            return;
        }
        this.activateSchemaMode();
    }

    disconnectedCallback() {
        if (this.hasAttribute("data-numeric-range")) {
            this.numericRangeFilters?.disconnect();
            return;
        }
        this.deactivateSchemaMode();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (!this.schemaDriven) {
            this.deactivateSchemaMode();
            return;
        }
        this.activateSchemaMode();
        if (["schema-endpoint", "source-id", "source-prefix"].includes(name)) {
            this.schemaFilters.invalidate();
        } else if (name === "show-brand") {
            this.schemaFilters.render();
        }
    }

    activateSchemaMode() {
        if (!this.schemaModeActive) {
            this.authoredContent = this.ownerDocument.createDocumentFragment();
            this.authoredContent.append(...this.childNodes);
            this.schemaModeActive = true;
        }
        this.style.display = "block";
        this.schemaFilters ||= new SchemaOfferFilters(this);
        this.schemaFilters.connect();
        this.schemaFilters.renderCurrent();
    }

    deactivateSchemaMode() {
        this.schemaFilters?.disconnect();
        this.removeAttribute("data-schema-category");
        this.removeAttribute("data-schema-status");
        if (this.schemaModeActive) {
            this.replaceChildren(this.authoredContent);
            this.authoredContent = null;
            this.schemaModeActive = false;
        }
        this.style.display = "contents";
    }

    managedParams() {
        return this.schemaFilters?.managedParams() ?? [];
    }

    get schemaDriven() {
        return this.hasAttribute("schema-driven") && this.getAttribute("schema-driven") !== "false";
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferFilter);
