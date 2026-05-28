import { Editor } from '@bernouy/cms-control/editor';
import Config from './configuration.html' with { type: 'text' };

const AUTO_COLOR_BUCKETS = 8;

export class BlocEditor extends Editor {

    private _observer?: MutationObserver;

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
    }

    init() {
        this._refresh();
        this._observer = new MutationObserver(() => this._refresh());
        this._observer.observe(this.target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['color'],
        });
    }

    restore() {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const host = this.target;
        if ((host.getAttribute('color') || 'auto') !== 'auto') {
            host.removeAttribute('data-auto-color');
            return;
        }
        const text = this._readLabel(host);
        const bucket = String(BlocEditor.hashBucket(text, AUTO_COLOR_BUCKETS));
        if (host.getAttribute('data-auto-color') !== bucket) {
            host.setAttribute('data-auto-color', bucket);
        }
    };

    private _readLabel(host: HTMLElement): string {
        return Array.from(host.childNodes)
            .filter(n => !(n instanceof Element && n.hasAttribute('slot')))
            .map(n => (n.textContent || '').trim())
            .join(' ')
            .trim();
    }

    static hashBucket(s: string, buckets: number): number {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h) % buckets;
    }
}
