import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    static observedAttributes = ['decimals', 'duration'];

    private _valueAnim: HTMLElement | null = null;
    private _valueSlot: HTMLSlotElement | null = null;
    private _trendSlot: HTMLSlotElement | null = null;
    private _trendIcon: HTMLElement | null = null;
    private _observer: IntersectionObserver | null = null;
    private _raf: number | null = null;
    private _animated = false;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._valueAnim = root.querySelector('.value-anim');
        this._valueSlot = root.querySelector('slot[name="value"]');
        this._trendSlot = root.querySelector('slot[name="trend"]');
        this._trendIcon = root.querySelector('.trend-icon');

        this._syncTrend();
        this._writeAnim(0);

        this._valueSlot?.addEventListener('slotchange', this._onValueChange);
        this._trendSlot?.addEventListener('slotchange', this._syncTrend);

        this._observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting && !this._animated) {
                    this._animated = true;
                    this._animate();
                    this._observer?.disconnect();
                }
            }
        }, { threshold: 0.4 });
        this._observer.observe(this);
    }

    disconnectedCallback(): void {
        this._observer?.disconnect();
        this._valueSlot?.removeEventListener('slotchange', this._onValueChange);
        this._trendSlot?.removeEventListener('slotchange', this._syncTrend);
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    attributeChangedCallback() {}

    private _slotText(slot: HTMLSlotElement | null): string {
        if (!slot) return '';
        return slot.assignedNodes({ flatten: true })
            .map(n => n.textContent ?? '')
            .join('')
            .trim();
    }

    private _target(): number {
        const raw = this._slotText(this._valueSlot).replace(/\s/g, '').replace(',', '.');
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }

    private _onValueChange = () => {};

    private _syncTrend = () => {
        const raw = this._slotText(this._trendSlot).replace('%', '').replace('+', '').trim();
        if (raw.length > 0 && Number.isFinite(Number(raw))) {
            const num = Number(raw);
            this.setAttribute('trend-dir', num > 0 ? 'up' : num < 0 ? 'down' : 'flat');
            if (this._trendIcon) this._trendIcon.textContent = num > 0 ? '▲' : num < 0 ? '▼' : '▬';
        } else {
            this.removeAttribute('trend-dir');
            if (this._trendIcon) this._trendIcon.textContent = '';
        }
    };

    private _animate() {
        const target = this._target();
        const duration = Number(this.getAttribute('duration') ?? '1600');
        if (duration <= 0 || target === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return; // nothing to animate — real slot stays visible
        }
        this._writeAnim(0);
        this.setAttribute('counting', '');
        const start = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 3);
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            this._writeAnim(target * ease(p));
            if (p < 1) {
                this._raf = requestAnimationFrame(tick);
            } else {
                this.removeAttribute('counting');
            }
        };
        this._raf = requestAnimationFrame(tick);
    }

    private _writeAnim(v: number) {
        if (!this._valueAnim) return;
        const decimals = Number(this.getAttribute('decimals') ?? '0');
        const locale = this.getAttribute('locale') ?? 'fr-FR';
        this._valueAnim.textContent = v.toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

}
