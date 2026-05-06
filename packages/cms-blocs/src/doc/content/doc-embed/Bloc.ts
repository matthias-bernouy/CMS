import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _iframe: HTMLIFrameElement | null = null;
    private _srcSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._iframe = this.shadowRoot?.querySelector('.embed') ?? null;
        this._srcSlot = this.shadowRoot?.querySelector('slot[name="src"]') ?? null;
        this._srcSlot?.addEventListener('slotchange', this._sync);
        this._sync();
    }

    disconnectedCallback(): void {
        this._srcSlot?.removeEventListener('slotchange', this._sync);
    }

    private _sync = () => {
        if (!this._iframe) return;
        const raw = this._srcSlot?.assignedNodes({ flatten: true }).map(n => n.textContent ?? '').join('').trim() ?? '';
        if (!raw) { this._iframe.src = ''; return; }
        this._iframe.src = this._resolve(raw);
    };

    private _resolve(url: string): string {
        const provider = this.getAttribute('provider') ?? 'auto';
        if (provider === 'youtube' || /youtube\.com|youtu\.be/.test(url)) {
            const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
            return m ? `https://www.youtube.com/embed/${m[1]}` : url;
        }
        if (provider === 'vimeo' || /vimeo\.com/.test(url)) {
            const m = url.match(/vimeo\.com\/(\d+)/);
            return m ? `https://player.vimeo.com/video/${m[1]}` : url;
        }
        return url;
    }
}
