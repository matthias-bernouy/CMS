import { Editor } from '@bernouy/cms/editor';
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
            attributeFilter: ['color', 'initials'],
        });
    }

    restore() {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const host = this.target;
        const name = this._readName(host);
        this._syncHasAvatar(host);
        this._syncInitials(host, name);
        this._syncAutoColor(host, name);
    };

    private _syncHasAvatar(host: HTMLElement) {
        const slot = host.querySelector(':scope > [slot="avatar"]');
        const hasImage = !!slot?.querySelector('img,picture,svg,video')
            || slot?.tagName === 'IMG' || slot?.tagName === 'PICTURE';
        host.toggleAttribute('has-avatar', !!hasImage);
    }

    private _readName(host: HTMLElement): string {
        const el = host.querySelector(':scope > [slot="name"]');
        return (el?.textContent || '').trim();
    }

    private _syncInitials(host: HTMLElement, name: string) {
        const override = host.getAttribute('initials');
        const value = (override && override.trim()) || BlocEditor.computeInitials(name);

        let node = host.querySelector(':scope > [slot="initials"]') as HTMLElement | null;
        if (!node) {
            node = document.createElement('span');
            node.setAttribute('slot', 'initials');
            host.appendChild(node);
        }
        if (node.textContent !== value) node.textContent = value;
    }

    private _syncAutoColor(host: HTMLElement, name: string) {
        const color = host.getAttribute('color') || 'auto';
        if (color !== 'auto') {
            host.removeAttribute('data-auto-color');
            return;
        }
        const bucket = String(BlocEditor.hashBucket(name, AUTO_COLOR_BUCKETS));
        if (host.getAttribute('data-auto-color') !== bucket) {
            host.setAttribute('data-auto-color', bucket);
        }
    }

    static computeInitials(name: string): string {
        const parts = name.split(/[\s-]+/).filter(p => p && /\p{L}/u.test(p[0]!));
        if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
        if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
        return '?';
    }

    static hashBucket(s: string, buckets: number): number {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h) % buckets;
    }

}
