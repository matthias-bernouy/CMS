import { Component } from "@bernouy/components/base";
import template from "../frame-template.html" with { type: "text" };
import css from "../style.css" with { type: "text" };

export class PhotoSiteShellFrame extends Component {
    constructor() {
        super({ css, template });
    }
}
