import { Editor } from '@bernouy/cms-control/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    private _observer?: MutationObserver;

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
    }

    init() {
        this._refresh();
        this._observer = new MutationObserver(() => this._refresh());
        this._observer.observe(this.target, { childList: true, subtree: true, characterData: true });
    }

    restore() {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const host = this.target;
        const label = host.querySelector(':scope > [slot="label"]');
        const hasLabel = !!(label?.textContent || '').trim();
        host.toggleAttribute('no-label', !hasLabel);
    };
}
