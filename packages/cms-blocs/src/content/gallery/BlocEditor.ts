import { Editor } from '@bernouy/cms/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    private _observer?: MutationObserver;

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
    }

    init() {
        this._refresh();
        this._observer = new MutationObserver(() => this._refresh());
        this._observer.observe(this.target, { childList: true });
    }

    restore() {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const count = this.target.querySelectorAll(':scope > img').length;
        this.target.setAttribute('data-count', String(count));
        this.target.toggleAttribute('data-empty', count === 0);
    };
}
