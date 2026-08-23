import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };

const css = ":host { display: block; }";

export class SiteCompositeBloc extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SiteCompositeBloc);
