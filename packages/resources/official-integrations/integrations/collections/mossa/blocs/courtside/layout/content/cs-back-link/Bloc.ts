import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }
}
