import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _btnYes = null;
    _btnNo = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._btnYes = this.shadowRoot?.querySelector(".yes") ?? null;
        this._btnNo = this.shadowRoot?.querySelector(".no") ?? null;
        this._btnYes?.addEventListener("click", this._voteYes);
        this._btnNo?.addEventListener("click", this._voteNo);
    }
    disconnectedCallback() {
        this._btnYes?.removeEventListener("click", this._voteYes);
        this._btnNo?.removeEventListener("click", this._voteNo);
    }
    _voteYes = () => this._vote("yes");
    _voteNo = () => this._vote("no");
    _vote(value) {
        this.setAttribute("state", "thanks");
        this.dispatchEvent(new CustomEvent("doc-feedback", { detail: { value }, bubbles: true, composed: true }));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
