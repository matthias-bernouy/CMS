import { Component } from "../../../base/Component";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class InputFile extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _preview: HTMLElement | null;
    private _dropZone: HTMLElement | null;
    private _liveRegion: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('input[type="file"]') ?? null;
        this._preview = this.shadowRoot?.querySelector('.file-info') ?? null;
        this._dropZone = this.shadowRoot?.querySelector('.drop-zone') ?? null;
        this._liveRegion = this.shadowRoot?.querySelector('.sr-live') ?? null;
    }

    static get observedAttributes() {
        return ['accept', 'multiple', 'name', 'disabled', 'required'];
    }

    override connectedCallback() {
        for (const prop of ['accept', 'multiple', 'name', 'disabled', 'required']) {
            this._upgradeProperty(prop);
        }

        this._input?.addEventListener('change', this._onInputChange);

        if (this._dropZone) {
            this._dropZone.addEventListener('dragover', this._onDragOver);
            this._dropZone.addEventListener('dragleave', this._onDragLeave);
            this._dropZone.addEventListener('drop', this._onDrop);
        }
    }

    disconnectedCallback() {
        this._input?.removeEventListener('change', this._onInputChange);

        if (this._dropZone) {
            this._dropZone.removeEventListener('dragover', this._onDragOver);
            this._dropZone.removeEventListener('dragleave', this._onDragLeave);
            this._dropZone.removeEventListener('drop', this._onDrop);
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;

        switch (name) {
            case 'accept':
                if (newVal === null) this._input.removeAttribute('accept');
                else this._input.setAttribute('accept', newVal);
                break;
            case 'multiple':
                this._input.multiple = this.hasAttribute('multiple');
                break;
            case 'name':
                if (newVal === null) this._input.removeAttribute('name');
                else this._input.setAttribute('name', newVal);
                break;
            case 'disabled':
                this._input.disabled = this.hasAttribute('disabled');
                break;
            case 'required':
                this._input.required = this.hasAttribute('required');
                break;
        }
    }

    private _onDragOver = (e: Event) => {
        e.preventDefault();
        if (this.hasAttribute('disabled')) return;
        this.toggleAttribute('dragging', true);
    };

    private _onDragLeave = (e: Event) => {
        e.preventDefault();
        this.toggleAttribute('dragging', false);
    };

    private _onDrop = (e: Event) => {
        const dragEvent = e as DragEvent;
        dragEvent.preventDefault();
        this.removeAttribute('dragging');
        if (this.hasAttribute('disabled')) return;
        if (dragEvent.dataTransfer?.files && this._input) {
            this._input.files = dragEvent.dataTransfer.files;
            this._updateValue();
        }
    };

    private _onInputChange = () => {
        this._updateValue();
    };

    private _updateValue() {
        const files = this._input?.files;
        if (!files || files.length === 0) {
            if (this._preview) this._preview.textContent = 'No file selected';
            this._internals.setFormValue(null);
            this._announce('No file selected');
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: { files: null }
            }));
            return;
        }

        const summary = files.length === 1 && files[0]
            ? `${files[0].name} (${this._formatSize(files[0].size)})`
            : `${files.length} files selected`;

        if (this._preview) this._preview.textContent = summary;

        if (files.length === 1 && files[0]) {
            this._internals.setFormValue(files[0]);
        } else {
            const data = new FormData();
            const name = this.getAttribute('name') || '';
            for (let i = 0; i < files.length; i++) {
                const file = files.item(i);
                if (file) data.append(name, file);
            }
            this._internals.setFormValue(data);
        }

        this._announce(`Selected: ${summary}`);
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { files }
        }));
    }

    private _formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    private _announce(message: string) {
        if (this._liveRegion) this._liveRegion.textContent = message;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get name(): string { return this.getAttribute('name') || ''; }
    set name(val: string) { this.setAttribute('name', val); }

    get accept(): string { return this.getAttribute('accept') || ''; }
    set accept(val: string) {
        if (val) this.setAttribute('accept', val);
        else this.removeAttribute('accept');
    }

    get multiple(): boolean { return this.hasAttribute('multiple'); }
    set multiple(val: boolean) {
        if (val) this.setAttribute('multiple', '');
        else this.removeAttribute('multiple');
    }

    get disabled(): boolean { return this.hasAttribute('disabled'); }
    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get required(): boolean { return this.hasAttribute('required'); }
    set required(val: boolean) {
        if (val) this.setAttribute('required', '');
        else this.removeAttribute('required');
    }

    get files(): FileList | null { return this._input?.files ?? null; }

    get value(): File | null { return this._input?.files?.[0] ?? null; }

    get form(): HTMLFormElement | null { return this._internals.form; }
}

if (!customElements.get("w13c-input-file")) {
    customElements.define("w13c-input-file", InputFile);
}
