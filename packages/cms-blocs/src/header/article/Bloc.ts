import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }
}
