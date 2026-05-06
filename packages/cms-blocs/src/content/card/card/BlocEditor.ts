import { Editor } from '@bernouy/cms/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
    }

    override getActionBarAnchor(): HTMLElement | null {
        return this.target.shadowRoot?.querySelector<HTMLElement>('.media') as HTMLElement;
    }

    init() {}
    restore() {}

}
