import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

type SourceRecord = Record<string, any>;
type Product = {
    id: number;
    title: string;
    description?: string | null;
    metadata?: SourceRecord;
};

export class Bloc extends Component {
    static observedAttributes = ["currency", "valuation-maximum-field", "valuation-minimum-field"];
    private searchTimer?: number;
    private input: HTMLInputElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.status.textContent = this.copy("start-typing-message");
        this.results.setAttribute("aria-label", this.copy("search-accessible-label"));
        this.copySlots.forEach((slot) => slot.addEventListener("slotchange", this.onCopyChange));
        void this.connectSearch();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            void this.loadProducts();
        }
    }

    disconnectedCallback(): void {
        this.copySlots.forEach((slot) => slot.removeEventListener("slotchange", this.onCopyChange));
        this.input?.removeEventListener("input", this.onSearch);
        this.input?.removeEventListener("focus", this.onSearch);
        this.input = null;
        window.clearTimeout(this.searchTimer);
    }

    private async connectSearch(): Promise<void> {
        await customElements.whenDefined("mossa-search-input");
        if (!this.isConnected || this.input) {
            return;
        }
        const search = this.shadowRoot?.querySelector<HTMLElement>("mossa-search-input");
        this.input = search?.shadowRoot?.querySelector<HTMLInputElement>("input") ?? null;
        this.input?.addEventListener("input", this.onSearch);
        this.input?.addEventListener("focus", this.onSearch);
    }

    private get results(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".results")!;
    }

    private get status(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".search-status")!;
    }

    private onSearch = () => {
        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => void this.loadProducts(), 180);
    };

    private onCopyChange = () => {
        this.results.setAttribute("aria-label", this.copy("search-accessible-label"));
        if (!this.input?.value.trim() && !this.shadowRoot!.querySelector<HTMLElement>(".initial-state")!.hidden) {
            this.status.textContent = this.copy("start-typing-message");
        }
    };

    private async loadProducts(): Promise<void> {
        if (!this.input) {
            return;
        }
        const query = this.input.value.trim();
        this.status.textContent = this.copy("searching-message");
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (query) {
                params.set("q", query);
            }
            const data = await this.request(`/.cms/sources/commerce/products?${params}`);
            const products = Array.isArray(data.items) ? (data.items as Product[]) : [];
            this.renderProducts(products);
            this.status.textContent = products.length
                ? this.copy(products.length === 1 ? "model-count-one-message" : "model-count-many-message", {
                      count: String(products.length),
                  })
                : this.copy("no-model-message");
        } catch {
            this.results.hidden = true;
            this.status.textContent = this.copy("unavailable-message");
        }
    }

    private renderProducts(products: Product[]): void {
        this.results.replaceChildren(
            ...products.map((product) => {
                const button = document.createElement("button");
                button.className = "result-option";
                button.type = "button";
                button.setAttribute("role", "option");

                const text = document.createElement("span");
                const title = document.createElement("strong");
                title.textContent = product.title;
                const caption = document.createElement("span");
                caption.textContent = this.productCaption(product);
                text.append(title, caption);

                const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                icon.setAttribute("viewBox", "0 0 24 24");
                icon.setAttribute("aria-hidden", "true");
                icon.innerHTML = '<path d="m9 18 6-6-6-6"></path>';
                button.append(text, icon);
                button.addEventListener("click", () => this.selectProduct(product));
                return button;
            }),
        );
        this.results.hidden = products.length === 0;
    }

    private productCaption(product: Product): string {
        return String(product.description || "").trim() || this.copy("catalogue-product-label");
    }

    private selectProduct(product: Product): void {
        if (!this.input) {
            return;
        }
        this.input.value = product.title;
        this.input.dispatchEvent(new Event("input", { bubbles: true }));
        window.clearTimeout(this.searchTimer);
        this.results.hidden = true;
        this.status.textContent = this.copy("selected-model-message", { title: product.title });

        this.shadowRoot!.querySelector<HTMLElement>("[data-product-title]")!.textContent = product.title;
        this.shadowRoot!.querySelector<HTMLElement>("[data-product-description]")!.textContent =
            product.description || this.productCaption(product);
        this.shadowRoot!.querySelector<HTMLElement>("[data-valuation-result]")!.hidden = false;
        this.shadowRoot!.querySelector<HTMLElement>(".initial-state")!.hidden = true;
        this.renderValuation(product.metadata);
    }

    private renderValuation(metadata: unknown): void {
        const valuation = productValuation(metadata, this.minimumField, this.maximumField);
        if (!valuation) {
            this.estimateNode.textContent = this.copy("range-pending-label");
            this.detailNode.textContent = this.copy("range-pending-description");
            return;
        }
        this.estimateNode.textContent = `${money(valuation.minimum, this.currency, formattingLocale())} – ${money(valuation.maximum, this.currency, formattingLocale())}`;
        this.detailNode.textContent = this.copy("range-description");
    }

    private copy(name: string, replacements: Readonly<Record<string, string>> = {}): string {
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>(`slot[name="${name}"]`);
        let value =
            slot
                ?.assignedNodes({ flatten: true })
                .map((node) => node.textContent || "")
                .join("")
                .trim() || "";
        for (const [key, replacement] of Object.entries(replacements)) {
            value = value.replaceAll(`{${key}}`, replacement);
        }
        return value;
    }

    private get copySlots(): HTMLSlotElement[] {
        return Array.from(this.shadowRoot?.querySelectorAll<HTMLSlotElement>("slot") ?? []);
    }

    private get estimateNode(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-estimate]")!;
    }

    private get detailNode(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-detail]")!;
    }

    private async request(path: string): Promise<SourceRecord> {
        const response = await fetch(path, {
            credentials: "include",
            headers: { accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Invalid Commerce response.");
        }
        return body as SourceRecord;
    }

    private get currency(): string {
        return (this.getAttribute("currency")?.trim() || "USD").toUpperCase();
    }

    private get minimumField(): string {
        return this.getAttribute("valuation-minimum-field")?.trim() || "valuationMinimum";
    }

    private get maximumField(): string {
        return this.getAttribute("valuation-maximum-field")?.trim() || "valuationMaximum";
    }
}

function formattingLocale(): string {
    return document.documentElement.lang.trim() || navigator.language || "en-US";
}

function productValuation(
    metadata: unknown,
    minimumField: string,
    maximumField: string,
): { minimum: number; maximum: number } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const values = metadata as SourceRecord;
    const minimum = metadataNumber(values[minimumField]);
    const maximum = metadataNumber(values[maximumField]);
    if (minimum === null || maximum === null || minimum < 0 || maximum < minimum) {
        return null;
    }
    return { minimum, maximum };
}

function metadataNumber(value: unknown): number | null {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function money(amount: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(Math.round(amount));
}
