import { Component } from "@bernouy/components/base";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    type SourceObservation,
} from "@bernouy/components/binding";
import { installOfferGallery } from "./gallery";
import { displayValue, metadataSpecifications, sourceSpecifications, variantSpecifications } from "./specifications";

type RecordValue = Record<string, any>;

export class PublicOffer extends Component {
    static observedAttributes = [
        "condition-tone",
        "image-fit",
        "price-tone",
        "purchase-appearance",
        "valuation-currency",
        "valuation-maximum-field",
        "valuation-minimum-field",
    ];

    private stopOfferObservation: (() => void) | null = null;
    private stopProductObservation: (() => void) | null = null;
    private stopGallery: (() => void) | null = null;
    private activeProductSource: HTMLElement | null = null;
    private activeSchemaSource: HTMLElement | null = null;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.stopOfferObservation = observeSource(this.offerSource, this.onOfferState);
        this.stopGallery = installOfferGallery(this, () => this.getAttribute("image-fit") || "contain");
    }

    disconnectedCallback(): void {
        this.stopGallery?.();
        this.stopOfferObservation?.();
        this.stopProductObservation?.();
        this.stopGallery = null;
        this.stopOfferObservation = null;
        this.stopProductObservation = null;
        this.activeProductSource = null;
        this.activeSchemaSource = null;
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        if (this.activeProductSource) {
            refreshSourceContext(this.activeProductSource);
        }
        if (this.activeSchemaSource) {
            refreshSourceContext(this.activeSchemaSource);
        }
    }

    private readonly onOfferState = (state: SourceObservation): void => {
        if (state.disposed || (!state.loaded && !state.empty)) {
            return;
        }
        queueMicrotask(() => this.connectProductPresentation());
    };

    private connectProductPresentation(): void {
        const source = this.querySelector<HTMLElement>('[cms-source-id="product"]');
        if (!source || source === this.activeProductSource) {
            return;
        }
        this.activeProductSource = source;
        setSourceContext(source, (product) => ({ presentation: this.presentation(product, null) }));
        this.stopProductObservation?.();
        this.stopProductObservation = observeSource(source, this.onProductState);
    }

    private readonly onProductState = (state: SourceObservation): void => {
        if (state.disposed || (!state.loaded && !state.empty)) {
            return;
        }
        queueMicrotask(() => this.connectSchemaPresentation());
    };

    private connectSchemaPresentation(): void {
        const source = this.querySelector<HTMLElement>('[cms-source-id="schema"]');
        const productSource = this.activeProductSource;
        if (!source || !productSource || source === this.activeSchemaSource) {
            return;
        }
        this.activeSchemaSource = source;
        setSourceContext(source, (schema) => ({
            presentation: this.presentation(readSourceData(productSource), schema),
        }));
    }

    private presentation(productValue: unknown, schemaValue: unknown): Record<string, unknown> {
        const offer = record(readSourceData(this.offerSource)) || {};
        const product = record(productValue) || {};
        const media = Array.isArray(offer.media)
            ? [...offer.media].filter(record).sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
            : [];
        const mainItem = media.find((item) => item.isMain) || media[0];
        const mainMedia = record(mainItem?.media) || {};
        const mediaItems = media.map((item) => {
            const image = record(item.media) || {};
            return {
                ...item,
                media: { ...image, alt: image.alt || offer.title || product.title || "" },
                selected: item === mainItem,
            };
        });
        const valuation = productValuation(
            product.metadata,
            this.getAttribute("valuation-minimum-field") || "valuationMinimum",
            this.getAttribute("valuation-maximum-field") || "valuationMaximum",
        );
        const variantId = offer.variantId ?? record(offer.variant)?.id;
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const variant = variants.find((item) => String(record(item)?.id) === String(variantId)) || offer.variant;
        const schema = record(schemaValue);
        const specifications = uniqueSpecifications([
            ...variantSpecifications(variant),
            ...sourceSpecifications(offer.specifications),
            ...metadataSpecifications(product.metadata, schema?.fields, [
                this.getAttribute("valuation-minimum-field") || "valuationMinimum",
                this.getAttribute("valuation-maximum-field") || "valuationMaximum",
            ]),
        ]);
        return {
            availability: offer.availability || "",
            conditionCode: offer.conditionCode || "",
            conditionLabel: offer.conditionLabel || "",
            conditionTone: this.getAttribute("condition-tone") || "neutral",
            currency: offer.currency || "",
            description: offer.description || "",
            hasValuation: valuation !== null,
            mainMedia: { ...mainMedia, alt: mainMedia.alt || offer.title || product.title || "" },
            media: mediaItems,
            meta: [record(product.brand)?.name, record(product.primaryCategory)?.label].filter(Boolean).join(" · "),
            modelTitle: product.title || "",
            offerId: offer.id || "",
            offerSlug: offer.slug || "",
            priceAmount: offer.acceptedPriceAmount,
            priceTone: this.getAttribute("price-tone") || "primary",
            purchaseAppearance: this.getAttribute("purchase-appearance") || "card",
            specifications,
            title: offer.title || product.title || "",
            valuationCurrency: (this.getAttribute("valuation-currency") || "USD").toUpperCase(),
            valuationMaximumMinor: valuation ? Math.round(valuation.maximum * 100) : null,
            valuationMinimumMinor: valuation ? Math.round(valuation.minimum * 100) : null,
        };
    }

    private get offerSource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="offer"]')!;
    }
}

function uniqueSpecifications(values: Array<[string, unknown, string?]>): Array<Record<string, string>> {
    const labels = new Set<string>();
    return values.flatMap(([label, value, unit]) => {
        if (value === null || value === undefined || value === "" || labels.has(label)) {
            return [];
        }
        labels.add(label);
        return [{ label, value: displayValue(value, unit) }];
    });
}

function productValuation(
    metadata: unknown,
    minimumField: string,
    maximumField: string,
): { minimum: number; maximum: number } | null {
    const values = record(metadata);
    const minimum = Number(values?.[minimumField]);
    const maximum = Number(values?.[maximumField]);
    return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum >= 0 && maximum >= minimum
        ? { minimum, maximum }
        : null;
}

function record(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", PublicOffer);
