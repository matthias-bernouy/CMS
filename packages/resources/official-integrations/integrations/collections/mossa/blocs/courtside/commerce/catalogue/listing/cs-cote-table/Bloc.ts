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
    private searchTimer?: number;
    private input: HTMLInputElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        void this.connectSearch();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("input", this.onSearch);
        this.input?.removeEventListener("focus", this.onSearch);
        this.input = null;
        window.clearTimeout(this.searchTimer);
    }

    private async connectSearch(): Promise<void> {
        await customElements.whenDefined("cs-search-input-prominent");
        if (!this.isConnected || this.input) {
            return;
        }
        const search = this.shadowRoot?.querySelector<HTMLElement>("cs-search-input-prominent");
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

    private async loadProducts(): Promise<void> {
        if (!this.input) {
            return;
        }
        const query = this.input.value.trim();
        this.status.textContent = "Recherche dans le catalogue Courtside…";
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (query) {
                params.set("q", query);
            }
            const data = await this.request(`products?${params}`);
            const products = Array.isArray(data.items) ? (data.items as Product[]) : [];
            this.renderProducts(products);
            this.status.textContent = products.length
                ? `${products.length} modèle${products.length > 1 ? "s" : ""} disponible${products.length > 1 ? "s" : ""}`
                : "Aucun modèle trouvé. Essaie une autre recherche.";
        } catch {
            this.results.hidden = true;
            this.status.textContent = "Le catalogue est momentanément indisponible.";
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
        const metadata = product.metadata || {};
        return (
            [metadata.player_level, metadata.play_style, metadata.weight ? `${metadata.weight} g` : ""]
                .filter(Boolean)
                .join(" · ") || "Raquette du catalogue Courtside"
        );
    }

    private selectProduct(product: Product): void {
        if (!this.input) {
            return;
        }
        this.input.value = product.title;
        this.input.dispatchEvent(new Event("input", { bubbles: true }));
        window.clearTimeout(this.searchTimer);
        this.results.hidden = true;
        this.status.textContent = `Modèle sélectionné : ${product.title}`;

        this.shadowRoot!.querySelector<HTMLElement>("[data-product-title]")!.textContent = product.title;
        this.shadowRoot!.querySelector<HTMLElement>("[data-product-description]")!.textContent =
            product.description || this.productCaption(product);
        this.shadowRoot!.querySelector<HTMLElement>(".valuation")!.hidden = false;
        this.shadowRoot!.querySelector<HTMLElement>(".initial-state")!.hidden = true;
        this.renderValuation(product.metadata);
    }

    private renderValuation(metadata: unknown): void {
        const valuation = productValuation(metadata);
        if (!valuation) {
            this.estimateNode.textContent = "Fourchette en cours de définition";
            this.detailNode.textContent = "Courtside confirmera le juste prix après examen de la raquette.";
            return;
        }
        this.estimateNode.textContent = `${euro(valuation.minimum)} – ${euro(valuation.maximum)}`;
        this.detailNode.textContent = "Fourchette unique définie par Courtside pour ce modèle.";
    }

    private get estimateNode(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-estimate]")!;
    }

    private get detailNode(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-detail]")!;
    }

    private async request(path: string): Promise<SourceRecord> {
        const response = await fetch(`/.cms/sources/commerce/${path}`, {
            credentials: "include",
            headers: { accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Réponse Commerce invalide.");
        }
        return body as SourceRecord;
    }
}

function productValuation(metadata: unknown): { minimum: number; maximum: number } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const values = metadata as SourceRecord;
    const minimum = metadataNumber(values.valuation_minimum_eur);
    const maximum = metadataNumber(values.valuation_maximum_eur);
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

function euro(amount: number): string {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Math.round(amount));
}
