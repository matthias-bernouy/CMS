/**
 * `<cms-headers-input>` — light-DOM repeating field for HTTP header pairs.
 *
 * Renders an initial empty row plus a `+` button. Each row is a
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
    private _onClick = (e: Event) => {
        const btn = (e.target as HTMLElement).closest('[data-action="add-header"]');
        if (!btn || !this.contains(btn)) return;
        e.preventDefault();
        this._addRow();
    };

    connectedCallback(): void {
        if (this.children.length === 0) {
            this._addRow();
            this._appendAddButton();
        }
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    private _addRow(): void {
        const idx = this._rowCount++;
        const row = document.createElement('p9r-stack');
        row.setAttribute('direction', 'row');
        row.setAttribute('gap', 'sm');
        row.dataset.role = 'header-row';

        row.appendChild(this._makeInput(`auth.headers.${idx}.name`,  'Header name'));
        row.appendChild(this._makeInput(`auth.headers.${idx}.value`, 'Header value'));

        const addBtn = this.querySelector('[data-action="add-header"]');
        if (addBtn) this.insertBefore(row, addBtn);
        else        this.appendChild(row);
    }

    private _makeInput(name: string, placeholder: string): HTMLElement {
        const input = document.createElement('p9r-input');
        input.setAttribute('name', name);
        input.setAttribute('placeholder', placeholder);
        return input;
    }

    private _appendAddButton(): void {
        const btn = document.createElement('p9r-button');
        btn.dataset.action = 'add-header';
        btn.textContent = '+';
        this.appendChild(btn);
    }
}

customElements.define('cms-headers-input', CmsHeadersInput);
