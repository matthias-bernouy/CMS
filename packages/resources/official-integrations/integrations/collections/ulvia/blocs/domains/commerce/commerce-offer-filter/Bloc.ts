import { NumericRangeFilters } from "./range/range-controller";
import { SchemaOfferFilters } from "./schema/schema";

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
        this.authoredTemplate = null;
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
            this.authoredTemplate =
                [...this.children].find(
                    (child) => child.localName === "template" && child.hasAttribute("data-authored-filter-content"),
                ) || this.ownerDocument.createElement("template");
            if (!this.authoredTemplate.hasAttribute("data-authored-filter-content")) {
                this.authoredTemplate.setAttribute("data-authored-filter-content", "");
                this.authoredTemplate.content.append(...this.childNodes);
                this.append(this.authoredTemplate);
            }
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
            const authoredContent = this.authoredTemplate?.content;
            if (authoredContent) {
                this.replaceChildren(authoredContent);
            } else {
                this.replaceChildren();
            }
            this.authoredTemplate = null;
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
