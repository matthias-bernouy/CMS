import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import "./DetailSection";

export class CmsShellDetail extends Component {
    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }
}

if (!customElements.get("cms-shell-detail")) customElements.define("cms-shell-detail", CmsShellDetail);
