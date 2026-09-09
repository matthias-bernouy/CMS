import { Component } from "@bernouy/components/base";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    type SourceObservation,
} from "@bernouy/components/binding";
import { orderCopy } from "../copy";
import { projectOrder } from "../presentation";

type SourceName = "offer" | "order" | "payment" | "relay" | "shipment";

export class OrderDetail extends Component {
    static observedAttributes = [...Object.keys(orderCopy), "checkout-url", "delivery-estimate-label", "progress-tone"];

    private sourceStops: Array<() => void> = [];
    private offerStop: (() => void) | null = null;
    private observedOffer: HTMLElement | null = null;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.orderSource, (order) => ({
            presentation: projectOrder(this, order, {
                offer: readSourceData(this.source("offer")),
                payment: readSourceData(this.source("payment")),
                relay: readSourceData(this.source("relay")),
                shipment: readSourceData(this.source("shipment")),
            }),
        }));
        for (const name of ["order", "payment", "relay", "shipment"] as const) {
            const source = this.source(name);
            if (source) {
                this.sourceStops.push(observeSource(source, (state) => this.onSourceState(name, state)));
            }
        }
    }

    disconnectedCallback(): void {
        for (const stop of this.sourceStops.splice(0)) {
            stop();
        }
        this.offerStop?.();
        this.offerStop = null;
        this.observedOffer = null;
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.orderSource);
        }
    }

    private readonly onSourceState = (name: SourceName, state: SourceObservation): void => {
        if (state.disposed) {
            return;
        }
        if (name === "order") {
            if (state.loaded || state.empty) {
                queueMicrotask(() => this.connectOfferSource());
            }
            return;
        }
        refreshSourceContext(this.orderSource);
    };

    private connectOfferSource(): void {
        const source = this.source("offer");
        if (!source || source === this.observedOffer) {
            return;
        }
        this.offerStop?.();
        this.observedOffer = source;
        this.offerStop = observeSource(source, (state) => this.onSourceState("offer", state));
    }

    private source(name: SourceName): HTMLElement | null {
        return this.querySelector<HTMLElement>(`[cms-source-id="${name}"]`);
    }

    private get orderSource(): HTMLElement {
        return this.source("order")!;
    }
}

customElements.define("mossa-order-controller", OrderDetail);
