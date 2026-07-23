import { SchemaOfferFilters } from "./schema";

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
    }

    connectedCallback() {
        if (!this.schemaDriven) {
            this.style.display = "contents";
            return;
        }
        this.style.display = "block";
        this.schemaFilters ||= new SchemaOfferFilters(this);
        this.schemaFilters.connect();
    }

    disconnectedCallback() {
        this.schemaFilters?.disconnect();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (!this.schemaDriven) {
            this.schemaFilters?.disconnect();
            this.style.display = "contents";
            return;
        }
        this.style.display = "block";
        this.schemaFilters ||= new SchemaOfferFilters(this);
        if (["schema-endpoint", "source-id", "source-prefix"].includes(name)) {
            this.schemaFilters.invalidate();
        } else if (name === "show-brand") {
            this.schemaFilters.render();
        } else {
            this.schemaFilters.connect();
        }
    }

    managedParams() {
        return this.schemaFilters?.managedParams() ?? [];
    }

    get schemaDriven() {
        return this.hasAttribute("schema-driven") && this.getAttribute("schema-driven") !== "false";
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferFilter);
