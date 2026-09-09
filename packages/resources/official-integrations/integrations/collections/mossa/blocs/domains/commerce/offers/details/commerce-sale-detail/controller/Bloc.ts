import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { projectSale, salePresentationAttributes } from "../presentation";

export class CommerceSaleDetailController extends Component {
    static observedAttributes = salePresentationAttributes;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (value) => ({ presentation: projectSale(this, value) }));
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="sale"]')!;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceSaleDetailController);
