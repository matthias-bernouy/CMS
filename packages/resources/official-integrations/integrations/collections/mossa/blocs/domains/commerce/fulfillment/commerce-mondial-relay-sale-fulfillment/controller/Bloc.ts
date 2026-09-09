import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { safeCmsLabelUrl } from "../helpers";
import { fulfillmentPresentation, presentationAttributes } from "../presentation";

export class CommerceMondialRelaySaleFulfillment extends Component {
    static observedAttributes = presentationAttributes;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.shipmentSource, (value) => ({ presentation: fulfillmentPresentation(this, value) }));
        this.addEventListener("cms-source:success", this.onSourceSuccess as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("cms-source:success", this.onSourceSuccess as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.shipmentSource);
        }
    }

    private readonly onSourceSuccess = (event: CustomEvent<{ body?: unknown }>): void => {
        if (event.target !== this.querySelector('[cms-source-id="label"]')) {
            return;
        }
        const origin = this.ownerDocument.defaultView?.location.origin || "http://localhost";
        const labelUrl = safeCmsLabelUrl(record(event.detail?.body)?.labelUrl, origin);
        if (!labelUrl) {
            return;
        }
        const link = this.ownerDocument.createElement("a");
        link.href = labelUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.hidden = true;
        this.append(link);
        link.click();
        link.remove();
    };

    private get shipmentSource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="shipment"]')!;
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceMondialRelaySaleFulfillment);
