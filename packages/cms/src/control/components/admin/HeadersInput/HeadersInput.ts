/**
 * `<cms-headers-input>` — light-DOM repeating field for HTTP header pairs.
 *
 * Renders an initial empty row plus a "+ Add header" trigger. Each row is a
 * `<p9r-stack direction="row">` carrying two `<p9r-input>` siblings named
 * `auth.headers.<n>.name` and `auth.headers.<n>.value`. Index `<n>`
 * increments per row and never reuses; the server-side parser tolerates
 * gaps so deletes (when added later) won't break submission.
 *
 * Inputs sit in light DOM so the parent `<cms-form>`'s native `FormData`
 * collection picks them up without any custom serialization.
 */
export class CmsHeadersInput extends HTMLElement {

    private _rowCount = 0;
    private _rowsContainer: HTMLElement | null = null;
    private _addBtn:        HTMLElement | null = null;

    private _onClick = (e: Event) => {
        const btn = (e.target as HTMLElement).closest('[data-action="add-header"]');
        if (!btn || !this.contains(btn)) return;
        e.preventDefault();
        this._addRow();
    };

    connectedCallback(): void {
        if (this.children.length === 0) {
            this._render();
            this._addRow();
        }
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    private _render(): void {
        // Host as a vertical stack so the rows and the add button sit
        // apart with a calm gap, instead of glued together. Inline style
        // is kept tiny and scoped — a CSS rule on the host would require
        // a stylesheet, which static admin pages can't carry.
        this.style.display       = 'flex';
        this.style.flexDirection = 'column';
        this.style.gap           = '0.75rem';

        this._rowsContainer = document.createElement('p9r-stack');
        this._rowsContainer.setAttribute('gap', 'sm');
        this.appendChild(this._rowsContainer);

        this._addBtn = this._makeAddButton();
        this.appendChild(this._addBtn);
    }

    private _addRow(): void {
        if (!this._rowsContainer) return;
        const idx = this._rowCount++;
        const row = document.createElement('p9r-stack');
        row.setAttribute('direction', 'row');
        row.setAttribute('gap', 'sm');
        row.dataset.role = 'header-row';
        row.appendChild(this._makeInput(`auth.headers.${idx}.name`,  'Header name'));
        row.appendChild(this._makeInput(`auth.headers.${idx}.value`, 'Header value'));
        this._rowsContainer.appendChild(row);
    }

    private _makeInput(name: string, placeholder: string): HTMLElement {
        const input = document.createElement('p9r-input');
        input.setAttribute('name', name);
        input.setAttribute('placeholder', placeholder);
        return input;
    }

    private _makeAddButton(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'flex-start';

        const btn = document.createElement('p9r-button');
        btn.setAttribute('variant', 'ghost');
        btn.setAttribute('color',   'secondary');
        btn.dataset.action = 'add-header';
        btn.innerHTML = `
            <svg slot="icon-left" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add header
        `;
        wrapper.appendChild(btn);
        return wrapper;
    }
}

customElements.define('cms-headers-input', CmsHeadersInput);
