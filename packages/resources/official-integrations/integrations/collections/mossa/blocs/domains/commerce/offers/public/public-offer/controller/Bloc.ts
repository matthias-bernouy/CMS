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
        "buy-label",
        "buy-url",
        "error-message",
        "error-title",
        "image-fit",
        "locale",
        "model-label",
        "secure-payment-label",
        "buyer-protection-label",
        "tracked-delivery-label",
        "negotiate-label",
        "negotiate-url",
        "price-label",
        "shipping-message",
        "slug-param",
        "valuation-label",
        "valuation-currency",
        "valuation-maximum-field",
        "valuation-minimum-field",
    ];
    private offer: RecordValue | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.detail.addEventListener("click", this.onThumbnailClick);
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
        this.syncText();
    }

    private async load(): Promise<void> {
        this.show("loading");
        if (!this.slug) {
            throw new Error(this.text("error-message", "This offer is no longer available or does not exist."));
        }
        this.offer = await this.request(`/.cms/sources/commerce/offer?slug=${encodeURIComponent(this.slug)}`);
        const product = this.offer.productId
            ? await this.request(
                  `/.cms/sources/commerce/product?id=${encodeURIComponent(String(this.offer.productId))}`,
              ).catch(() => null)
            : null;
        this.renderOffer(this.offer, product?.metadata ?? this.offer.product?.metadata);
        this.show("content");
    }

    private renderOffer(offer: RecordValue, productMetadata: unknown): void {
        this.titleElement.textContent = offer.title || offer.product?.title || "Offer";
        const description = String(offer.description || "").trim();
        this.descriptionElement.textContent = description;
        this.descriptionElement.hidden = !description;
        this.conditionBadge.setAttribute("code", String(offer.conditionCode || ""));
        const conditionLabel = String(offer.conditionLabel || "").trim();
        if (conditionLabel) {
            this.conditionBadge.setAttribute("label", conditionLabel);
        } else {
            this.conditionBadge.removeAttribute("label");
        }
        const meta = [offer.product?.brand?.name, offer.product?.primaryCategory?.label].filter(Boolean).join(" · ");
        this.metaElement.textContent = meta;
        this.metaElement.hidden = !meta;
        this.priceElement.textContent = money(offer.acceptedPriceAmount, offer.currency, this.locale);
        this.renderValuation(productMetadata);
        this.renderMedia(Array.isArray(offer.media) ? offer.media : [], offer.title);
        this.renderSpecifications(offer);
        this.buyButton.textContent = `${this.text("buy-label", "Buy")} · ${money(offer.acceptedPriceAmount, offer.currency, this.locale)}`;
        const buyUrl = this.getAttribute("buy-url")?.trim() || "";
        const available = offer.availability === "available" && Boolean(buyUrl);
        if (available) {
            this.buyButton.setAttribute("href", this.url(buyUrl, offer));
            this.buyButton.removeAttribute("aria-disabled");
            this.buyButton.removeAttribute("tabindex");
        } else {
            this.buyButton.removeAttribute("href");
            this.buyButton.setAttribute("aria-disabled", "true");
            this.buyButton.setAttribute("tabindex", "-1");
        }
        const negotiateUrl = this.getAttribute("negotiate-url")?.trim() || "";
        this.negotiateButton.closest("mossa-button")?.toggleAttribute("hidden", !negotiateUrl);
        if (negotiateUrl) {
            this.negotiateButton.setAttribute("href", this.url(negotiateUrl, offer));
        } else {
            this.negotiateButton.removeAttribute("href");
        }
        this.negotiateButton.textContent = this.text("negotiate-label", "Make an offer");
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
        const valuation = productValuation(
            metadata,
            this.getAttribute("valuation-minimum-field") || "valuationMinimum",
            this.getAttribute("valuation-maximum-field") || "valuationMaximum",
        );
        if (!valuation) {
            this.valuation.hidden = true;
            return;
        }
        this.valuation.hidden = false;
        this.valuationValue.textContent = `${wholeMoney(valuation.minimum, this.valuationCurrency, this.locale)} – ${wholeMoney(valuation.maximum, this.valuationCurrency, this.locale)}`;
    }

    private renderSpecifications(offer: RecordValue): void {
        this.specifications.replaceChildren();
        const values: Array<[string, unknown, string?]> = [
            [this.text("model-label", "Model"), offer.product?.title],
            ...variantSpecifications(offer.variant),
            ...sourceSpecifications(offer.specifications),
        ];
        const seen = new Set<string>();
        for (const [label, value, unit] of values) {
            if (value === null || value === undefined || value === "" || seen.has(label)) {
                continue;
            }
            seen.add(label);
            const row = document.createElement("mossa-specification");
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
        return `/.cms/sources/commerce/publicOfferImage?id=${encodeURIComponent(mediaId)}`;
    }

    private syncText(): void {
        this.errorTitle.textContent = this.text("error-title", "Offer not found");
        this.errorMessage.textContent = this.text(
            "error-message",
            "This offer is no longer available or does not exist.",
        );
        this.backButton.textContent = this.text("back-label", "Back to offers");
        this.priceLabel.textContent = this.text("price-label", "Seller price");
        this.valuationLabel.textContent = this.text("valuation-label", "Reference value");
        this.shippingMessage.textContent = this.text("shipping-message", "Pickup-point delivery available");
        for (const [attribute, fallback] of [
            ["secure-payment-label", "Secure payment"],
            ["buyer-protection-label", "Buyer protection"],
            ["tracked-delivery-label", "Tracked delivery"],
        ]) {
            this.shadowRoot!.querySelector(`[data-${attribute}]`)!.textContent = this.text(attribute!, fallback!);
        }
        if (this.offer) {
            this.renderSpecifications(this.offer);
        }
        this.mainImage.style.objectFit = this.getAttribute("image-fit") || "contain";
    }

    private fail(_error: unknown): void {
        this.errorMessage.textContent = this.text(
            "error-message",
            "This offer is no longer available or does not exist.",
        );
        this.show("error");
    }
    private show(state: "loading" | "content" | "error"): void {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }
    private async request(path: string): Promise<RecordValue> {
        const response = await fetch(path, {
            credentials: "include",
            headers: { accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`The request failed (${response.status}).`);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("The service returned an invalid response.");
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
        return new URL(location.href).searchParams.get(this.getAttribute("slug-param") || "slug") || "";
    }
    private get locale(): string {
        return this.getAttribute("locale") || "en-US";
    }
    private get valuationCurrency(): string {
        return (this.getAttribute("valuation-currency")?.trim() || "USD").toUpperCase();
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
        return "Price unavailable";
    }
    const rounded = Math.round(value / 100);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${String(currency || "USD").toUpperCase()}`;
    }
}
function productValuation(
    metadata: unknown,
    minimumField: string,
    maximumField: string,
): { minimum: number; maximum: number } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const values = metadata as RecordValue;
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
function wholeMoney(amount: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(Math.round(amount));
}
function variantSpecifications(variant: unknown): Array<[string, unknown, string?]> {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
        return [];
    }
    const value = variant as RecordValue;
    const options = Array.isArray(value.options) ? value.options : Array.isArray(value.choices) ? value.choices : [];
    if (options.length) {
        return options.flatMap((option) => {
            if (!option || typeof option !== "object") {
                return [];
            }
            const item = option as RecordValue;
            const label = String(item.axisLabel || item.axisKey || "Option").trim();
            const optionValue = String(item.valueLabel || item.valueKey || "").trim();
            return optionValue ? [[label, optionValue] as [string, unknown, string?]] : [];
        });
    }
    const title = String(value.title || "").trim();
    return title ? [["Variant", title]] : [];
}
function sourceSpecifications(value: unknown): Array<[string, unknown, string?]> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
            return [];
        }
        const specification = entry as RecordValue;
        const label = String(specification.label || "").trim();
        const fieldValue = specification.value;
        return label && fieldValue !== undefined
            ? [[label, fieldValue, String(specification.unit || "").trim() || undefined]]
            : [];
    });
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
