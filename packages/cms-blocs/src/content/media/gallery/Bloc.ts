import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _current = 0;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        if (this.getAttribute('lightbox') === 'off') return;

        this.addEventListener('click', this._onImgClick);

        const root = this.shadowRoot!;
        root.querySelector('.lb-close')?.addEventListener('click', this._close);
        root.querySelector('.lb-prev')?.addEventListener('click', this._prev);
        root.querySelector('.lb-next')?.addEventListener('click', this._next);
        root.querySelector<HTMLElement>('.lightbox')?.addEventListener('click', this._onDialogClick);
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onImgClick);
        document.removeEventListener('keydown', this._onKey);
    }

    private _images(): HTMLImageElement[] {
        return Array.from(this.querySelectorAll('img'));
    }

    private _onImgClick = (e: MouseEvent) => {
        const img = (e.target as HTMLElement).closest('img');
        if (!img || !this.contains(img)) return;
        const imgs = this._images();
        const idx = imgs.indexOf(img as HTMLImageElement);
        if (idx < 0) return;
        this._open(idx);
    };

    private _open(i: number) {
        this._current = i;
        this._render();
        const dlg = this.shadowRoot!.querySelector('.lightbox') as HTMLDialogElement;
        if (!dlg.open) dlg.showModal();
    }

    private _render() {
        const imgs = this._images();
        const img = imgs[this._current];
        if (!img) return;
        const lbImg = this.shadowRoot!.querySelector('.lb-img') as HTMLImageElement;
        const lbCap = this.shadowRoot!.querySelector('.lb-caption') as HTMLElement;
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt || '';
        lbCap.textContent = img.getAttribute('data-caption') || img.alt || '';
    }

    private _close = () => {
        const dlg = this.shadowRoot!.querySelector('.lightbox') as HTMLDialogElement;
        if (dlg.open) dlg.close();
    };

    private _prev = () => {
        const imgs = this._images();
        this._current = (this._current - 1 + imgs.length) % imgs.length;
        this._render();
    };

    private _next = () => {
        const imgs = this._images();
        this._current = (this._current + 1) % imgs.length;
        this._render();
    };

    private _onDialogClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('lightbox')) this._close();
    };

    private _onKey = (e: KeyboardEvent) => {
        const dlg = this.shadowRoot!.querySelector('.lightbox') as HTMLDialogElement;
        if (!dlg.open) return;
        if (e.key === 'ArrowLeft') this._prev();
        else if (e.key === 'ArrowRight') this._next();
    };

}
