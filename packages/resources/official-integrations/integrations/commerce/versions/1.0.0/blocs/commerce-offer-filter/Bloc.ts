export class CommerceOfferFilter extends HTMLElement {
    connectedCallback() {
        this.style.display = "contents";
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferFilter);
