import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type RecordValue = Record<string, any>;

export class PublicOffer extends Component {
    static observedAttributes = [
        "back-label",
        "button-accent-color",
        "button-background-color",
        "button-border-color",
        "button-text-color",
        "buy-label",
        "buy-url",
        "error-message",
        "error-title",
        "image-fit",
        "locale",
        "negotiate-label",
        "negotiate-url",
        "price-label",
        "shipping-message",
        "source-id",
        "source-prefix",
        "valuation-label",
    ];
    private offer: RecordValue | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.detail.addEventListener("click", this.onThumbnailClick);
        this.syncPresentation();
        this.syncText();
        this.load().catch((error) => this.fail(error));
    }

    disconnectedCallback(): void {
        this.detail.removeEventListener("click", this.onThumbnailClick);
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        this.syncPresentation();
        this.syncText();
    }

    private async load(): Promise<void> {
        this.show("loading");
        if (!this.slug) {
            throw new Error(this.text("error-message", "Cette annonce n’est plus disponible ou n’existe pas."));
        }
        this.offer = await this.request(`offer?slug=${encodeURIComponent(this.slug)}`);
        const product = this.offer.productId
            ? await this.request(`product?id=${encodeURIComponent(String(this.offer.productId))}`).catch(() => null)
            : null;
        this.renderOffer(this.offer, product?.metadata ?? this.offer.product?.metadata);
        this.show("content");
    }

    private renderOffer(offer: RecordValue, productMetadata: unknown): void {
        this.titleElement.textContent = offer.title || offer.product?.title || "Annonce";
        const description = String(offer.description || "").trim();
        this.descriptionElement.textContent = description;
        this.descriptionElement.hidden = !description;
        this.conditionBadge.setAttribute("code", String(offer.conditionCode || ""));
        const meta = [offer.product?.brand?.name, offer.product?.primaryCategory?.label].filter(Boolean).join(" · ");
        this.metaElement.textContent = meta;
        this.metaElement.hidden = !meta;
        this.priceElement.textContent = money(offer.acceptedPriceAmount, offer.currency, this.locale);
        this.renderValuation(productMetadata);
        this.renderMedia(Array.isArray(offer.media) ? offer.media : [], offer.title);
        this.renderSpecifications(offer);
        this.buyButton.textContent = `${this.text("buy-label", "Acheter")} · ${money(offer.acceptedPriceAmount, offer.currency, this.locale)}`;
        const available = offer.availability === "available";
        if (available) {
            this.buyButton.setAttribute(
                "href",
                this.url(this.getAttribute("buy-url") || "/checkout?offerId={id}", offer),
            );
            this.buyButton.removeAttribute("aria-disabled");
            this.buyButton.removeAttribute("tabindex");
        } else {
            this.buyButton.removeAttribute("href");
            this.buyButton.setAttribute("aria-disabled", "true");
            this.buyButton.setAttribute("tabindex", "-1");
        }
        this.negotiateButton.setAttribute(
            "href",
            this.url(this.getAttribute("negotiate-url") || "/make-offer?slug={slug}", offer),
        );
        this.negotiateButton.textContent = this.text("negotiate-label", "Proposer un prix");
    }

    private renderMedia(items: RecordValue[], title: string): void {
        this.detail.querySelectorAll('[slot="thumbnails"]').forEach((item) => item.remove());
        const sorted = [...items].sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder));
        const main = sorted.find((item) => item.isMain) || sorted[0];
        if (!main?.media?.id) {
            clearPublicSourceImage(this.mainImage);
            this.mainImage.alt = "";
            return;
        }
        this.setMainImage(main.media, main.media.alt || title);
        for (const [index, item] of sorted.entries()) {
            if (!item.media?.id) {
                continue;
            }
            const image = document.createElement("img");
            image.slot = "thumbnails";
            image.loading = "lazy";
            image.decoding = "async";
            bindPublicSourceImage(image, this.imageUrl(item.media.id), item.media.width, item.media.height);
            image.alt = item.media.alt || `${title} — photo ${index + 1}`;
            image.dataset.mediaId = String(item.media.id);
            if (item.media.id === main.media.id) {
                image.setAttribute("data-active", "");
            }
            this.detail.append(image);
        }
    }

    private renderValuation(metadata: unknown): void {
        const valuation = productValuation(metadata);
        if (!valuation) {
            this.valuation.hidden = true;
            return;
        }
        this.valuation.hidden = false;
        this.valuationValue.textContent = `${euro(valuation.minimum, this.locale)} – ${euro(valuation.maximum, this.locale)}`;
    }

    private renderSpecifications(offer: RecordValue): void {
        this.specifications.replaceChildren();
        const values: Array<[string, unknown, string?]> = [
            ["Modèle", offer.product?.title],
            ...variantSpecifications(offer.variant?.title),
            ...metadataSpecifications(offer.product?.metadata),
            ...metadataSpecifications(offer.metadata),
        ];
        const seen = new Set<string>();
        for (const [label, value, unit] of values) {
            if (value === null || value === undefined || value === "" || seen.has(label)) {
                continue;
            }
            seen.add(label);
            const row = document.createElement("cs-spec-row");
            const labelElement = document.createElement("span");
            labelElement.slot = "label";
            labelElement.textContent = label;
            const valueElement = document.createElement("span");
            valueElement.slot = "value";
            valueElement.textContent = displayValue(value, unit);
            row.append(labelElement, valueElement);
            this.specifications.append(row);
        }
        this.specifications.hidden = !this.specifications.childElementCount;
    }

    private onThumbnailClick = (event: Event): void => {
        const image = (event.target as HTMLElement).closest<HTMLImageElement>('[slot="thumbnails"][data-media-id]');
        if (!image) {
            return;
        }
        this.setMainImage(
            {
                id: image.dataset.mediaId!,
                width: image.getAttribute("data-source-width"),
                height: image.getAttribute("data-source-height"),
            },
            image.alt,
        );
        this.detail
            .querySelectorAll('[slot="thumbnails"]')
            .forEach((item) => item.toggleAttribute("data-active", item === image));
    };

    private setMainImage(media: RecordValue, alt: string): void {
        bindPublicSourceImage(this.mainImage, this.imageUrl(media.id), media.width, media.height);
        this.mainImage.alt = alt;
    }
    private imageUrl(mediaId: string | number): string {
        return `${this.sourceBase}/publicOfferImage?id=${encodeURIComponent(mediaId)}`;
    }

    private syncText(): void {
        this.errorTitle.textContent = this.text("error-title", "Annonce introuvable");
        this.errorMessage.textContent = this.text(
            "error-message",
            "Cette annonce n’est plus disponible ou n’existe pas.",
        );
        this.backButton.textContent = this.text("back-label", "Retour aux annonces");
        this.priceLabel.textContent = this.text("price-label", "Prix vendeur");
        this.valuationLabel.textContent = this.text("valuation-label", "Cote Courtside");
        this.shippingMessage.textContent = this.text("shipping-message", "Livraison disponible en point relais");
        this.mainImage.style.objectFit = this.getAttribute("image-fit") || "contain";
    }

    private syncPresentation(): void {
        const properties: Array<[string, string, string]> = [
            ["button-text-color", "--public-offer-button-text", "var(--ulvia-primary-foreground)"],
            ["button-background-color", "--public-offer-button-background", "var(--ulvia-primary-base)"],
            ["button-border-color", "--public-offer-button-border", "var(--ulvia-primary-base)"],
            ["button-accent-color", "--public-offer-button-accent", "var(--ulvia-primary-contrasted)"],
        ];
        for (const [attribute, property, fallback] of properties) {
            this.style.setProperty(property, this.getAttribute(attribute)?.trim() || fallback);
        }
    }

    private fail(_error: unknown): void {
        this.errorMessage.textContent = this.text(
            "error-message",
            "Cette annonce n’est plus disponible ou n’existe pas.",
        );
        this.show("error");
    }
    private show(state: "loading" | "content" | "error"): void {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }
    private async request(endpoint: string): Promise<RecordValue> {
        const response = await fetch(`${this.sourceBase}/${endpoint}`, {
            credentials: "include",
            headers: { accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`La requête a échoué (${response.status}).`);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Le service a renvoyé une réponse invalide.");
        }
        return body;
    }
    private url(pattern: string, offer: RecordValue): string {
        return pattern
            .replaceAll("{id}", encodeURIComponent(String(offer.id || "")))
            .replaceAll("{slug}", encodeURIComponent(String(offer.slug || "")));
    }
    private text(name: string, fallback: string): string {
        return this.getAttribute(name)?.trim() || fallback;
    }
    private get slug(): string {
        return new URL(location.href).searchParams.get("slug") || "";
    }
    private get locale(): string {
        return this.getAttribute("locale") || "fr-FR";
    }
    private get sourceBase(): string {
        return `${(this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "")}/${encodeURIComponent(this.getAttribute("source-id") || "commerce")}`;
    }
    private get loading() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-loading]")!;
    }
    private get content() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-content]")!;
    }
    private get error() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error]")!;
    }
    private get detail() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-detail]")!;
    }
    private get mainImage() {
        return this.shadowRoot!.querySelector<HTMLImageElement>("[data-main-image]")!;
    }
    private get titleElement() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-title]")!;
    }
    private get metaElement() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-meta]")!;
    }
    private get conditionBadge() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-condition]")!;
    }
    private get descriptionElement() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-description]")!;
    }
    private get valuation() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-valuation]")!;
    }
    private get valuationLabel() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-valuation-label]")!;
    }
    private get valuationValue() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-valuation-value]")!;
    }
    private get priceLabel() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-price-label]")!;
    }
    private get priceElement() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-price]")!;
    }
    private get specifications() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-specifications]")!;
    }
    private get shippingMessage() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-shipping-message]")!;
    }
    private get buyButton() {
        return this.querySelector<HTMLAnchorElement>("[data-buy]")!;
    }
    private get negotiateButton() {
        return this.querySelector<HTMLAnchorElement>("[data-negotiate]")!;
    }
    private get errorTitle() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error-title]")!;
    }
    private get errorMessage() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error-message]")!;
    }
    private get backButton() {
        return this.querySelector<HTMLAnchorElement>("[data-back]")!;
    }
}

function bindPublicSourceImage(image: HTMLImageElement, url: string, width: unknown, height: unknown): void {
    const sourceWidth = positiveInteger(width);
    const sourceHeight = positiveInteger(height);
    image.setAttribute("data-source-image-access", "public");
    if (sourceWidth !== null && sourceHeight !== null) {
        image.setAttribute("data-source-width", String(sourceWidth));
        image.setAttribute("data-source-height", String(sourceHeight));
    } else {
        image.removeAttribute("data-source-width");
        image.removeAttribute("data-source-height");
    }
    image.setAttribute("data-cms-src", url);
    syncResponsiveSourceImageElement(image);
}

function clearPublicSourceImage(image: HTMLImageElement): void {
    clearResponsiveSourceImageElement(image);
    image.removeAttribute("data-cms-src");
    image.removeAttribute("data-source-width");
    image.removeAttribute("data-source-height");
    image.removeAttribute("data-source-image-access");
}

function positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function money(amount: unknown, currency: unknown, locale: string): string {
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return "Prix indisponible";
    }
    const rounded = Math.round(value / 100);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${String(currency || "EUR").toUpperCase()}`;
    }
}
function productValuation(metadata: unknown): { minimum: number; maximum: number } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const values = metadata as RecordValue;
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
function euro(amount: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Math.round(amount));
}
function variantSpecifications(title: unknown): Array<[string, unknown, string?]> {
    const text = String(title || "").trim();
    if (!text) {
        return [];
    }
    const grip = /^manche\s+(.+)$/i.exec(text);
    if (grip) {
        return [["Taille de manche", grip[1]!.trim()]];
    }
    const segments = text
        .split(/\s*\/\s*/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const parsed = segments.flatMap((segment) => {
        const match = /^([^:]+):\s*(.+)$/.exec(segment);
        if (!match) {
            return [];
        }
        const definition = metadataDefinition(match[1]!.trim());
        return [[definition?.label || "Variante", match[2]!.trim(), definition?.unit] as [string, unknown, string?]];
    });
    return parsed.length === segments.length ? parsed : [["Variante", text]];
}
function metadataSpecifications(value: unknown): Array<[string, unknown, string?]> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }
    return Object.entries(value).flatMap(([key, fieldValue]) => {
        const definition = metadataDefinition(key);
        return definition ? [[definition.label, fieldValue, definition.unit]] : [];
    });
}
function metadataDefinition(key: string): { label: string; unit?: string } | null {
    const normalized = key
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replaceAll("-", "_")
        .toLowerCase();
    return (
        (
            {
                racket_sport: { label: "Sport" },
                product_line: { label: "Gamme" },
                model_year: { label: "Année du modèle" },
                weight: { label: "Poids", unit: "g" },
                head_size: { label: "Taille du tamis", unit: "cm²" },
                balance: { label: "Équilibre", unit: "mm" },
                balance_type: { label: "Répartition de l’équilibre" },
                string_pattern: { label: "Plan de cordage" },
                player_level: { label: "Niveau de jeu" },
                play_style: { label: "Style de jeu" },
                grip: { label: "Taille de manche" },
                grip_size: { label: "Taille de manche" },
                shape: { label: "Forme" },
                core: { label: "Noyau" },
                surface: { label: "Surface" },
                thickness: { label: "Épaisseur", unit: "mm" },
            } as Record<string, { label: string; unit?: string }>
        )[normalized] || null
    );
}
function displayValue(value: unknown, unit?: string): string {
    if (Array.isArray(value)) {
        return value.map((item) => displayValue(item)).join(", ");
    }
    if (typeof value === "boolean") {
        return value ? "Oui" : "Non";
    }
    if (typeof value === "object" && value) {
        return Object.values(value)
            .map((item) => displayValue(item))
            .join(" · ");
    }
    const text = String(value);
    return unit && !text.toLowerCase().endsWith(unit.toLowerCase()) ? `${text} ${unit}` : text;
}
