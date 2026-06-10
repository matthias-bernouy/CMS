import { Component } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Badge extends Component {

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }
}
