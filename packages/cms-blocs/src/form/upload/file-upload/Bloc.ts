import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

const ATTR_MIRROR = ['required', 'disabled', 'multiple', 'capture'];

export class Bloc extends Component {

    static observedAttributes = [...ATTR_MIRROR];

    private _input: HTMLInputElement | null = null;
    private _drop: HTMLLabelElement | null = null;
    private _status: HTMLSpanElement | null = null;
    private _slotName: HTMLSlotElement | null = null;
    private _slotAccept: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._input = root.querySelector('input') as HTMLInputElement;
        this._drop = root.querySelector('label.drop') as HTMLLabelElement;
        this._status = root.querySelector('.status') as HTMLSpanElement;
        this._slotName = root.querySelector('slot[name="field-name"]');
        this._slotAccept = root.querySelector('slot[name="accept"]');
        if (!this._input || !this._drop) return;

        this._slotName?.addEventListener('slotchange', this._syncName);
        this._slotAccept?.addEventListener('slotchange', this._syncAccept);
        this._input.addEventListener('change', this._onChange);
        this._drop.addEventListener('dragover', this._onDragOver);
        this._drop.addEventListener('dragleave', this._onDragLeave);
        this._drop.addEventListener('drop', this._onDrop);

        this._syncName();
        this._syncAccept();
        this._syncAttrs();
    }

    disconnectedCallback(): void {
        this._slotName?.removeEventListener('slotchange', this._syncName);
        this._slotAccept?.removeEventListener('slotchange', this._syncAccept);
        this._input?.removeEventListener('change', this._onChange);
        this._drop?.removeEventListener('dragover', this._onDragOver);
        this._drop?.removeEventListener('dragleave', this._onDragLeave);
        this._drop?.removeEventListener('drop', this._onDrop);
    }

    attributeChangedCallback() {
        this._syncAttrs();
    }

    get name(): string { return this.getAttribute('name') ?? ''; }
    get files(): FileList | null { return this._input?.files ?? null; }

    private _syncName = () => {
        if (!this._input || !this._slotName) return;
        const name = this._readSlot(this._slotName);
        if (name) { this._input.name = name; this.setAttribute('name', name); }
        else { this._input.removeAttribute('name'); this.removeAttribute('name'); }
    };

    private _syncAccept = () => {
        if (!this._input || !this._slotAccept) return;
        const v = this._readSlot(this._slotAccept);
        if (v) this._input.accept = v;
        else this._input.removeAttribute('accept');
    };

    private _readSlot(slot: HTMLSlotElement): string {
        return slot.assignedNodes({ flatten: true })
            .map(n => (n as Node).textContent ?? '')
            .join('')
            .trim();
    }

    private _syncAttrs() {
        if (!this._input) return;
        for (const a of ATTR_MIRROR) {
            const v = this.getAttribute(a);
            if (v == null) this._input.removeAttribute(a);
            else this._input.setAttribute(a, v);
        }
    }

    private _onChange = () => {
        this._updateStatus();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };

    private _updateStatus() {
        if (!this._status || !this._input) return;
        const files = this._input.files;
        if (!files || files.length === 0) { this._status.textContent = ''; return; }
        if (files.length === 1) this._status.textContent = files[0]?.name ?? '';
        else this._status.textContent = `${files.length} files selected`;
    }

    private _onDragOver = (e: DragEvent) => {
        if (this.hasAttribute('disabled')) return;
        e.preventDefault();
        this.setAttribute('dragging', '');
    };

    private _onDragLeave = (e: DragEvent) => {
        if (e.target !== this._drop) return;
        this.removeAttribute('dragging');
    };

    private _onDrop = (e: DragEvent) => {
        if (this.hasAttribute('disabled')) return;
        e.preventDefault();
        this.removeAttribute('dragging');
        if (!this._input || !e.dataTransfer) return;
        this._input.files = e.dataTransfer.files;
        this._updateStatus();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
}
