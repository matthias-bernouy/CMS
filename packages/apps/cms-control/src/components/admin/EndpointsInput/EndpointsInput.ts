import { HTTP_METHODS } from "@bernouy/cms-gateway";

/**
 * `<cms-endpoints-input>` — light-DOM repeating field for gateway endpoints.
 *
 * Each row carries three controls named `endpoints.<n>.endpointId`,
 * `endpoints.<n>.method` and `endpoints.<n>.targetUrl`, plus a remove button.
 * The inputs sit in light DOM, so the parent `<cms-form>`'s native `FormData`
 * collection picks them up with zero custom serialization; the server-side
 * `parseProviderDto` reconstructs the `endpoints[]` array from those flat
 * indexed keys.
 *
 * Index `<n>` increments per row and never reuses — removing a row leaves a gap,
 * and the parser compacts sparse indices, so deletes never collide.
 *
 * Prefill (edit mode): a `value` attribute holding a JSON array of
 * `{endpointId, method, targetUrl}` seeds one row per element on connect, then
 * resumes the counter at N so later "Add" rows don't collide. This connect-time
 * read is safe because the admin's template interpolation rewrites the `value`
 * attribute to its final string BEFORE the element is inserted into the live DOM
 * (see `render.ts`). Absent / empty / malformed `value` → a single empty row
 * (create mode).
 */
type EndpointSeed = { endpointId?: string; method?: string; targetUrl?: string };

export class CmsEndpointsInput extends HTMLElement {

    private _rowCount = 0;
    private _initialized = false;
    private _rowsContainer: HTMLElement | null = null;

    private _onClick = (e: Event) => {
        const target = e.target as HTMLElement;

        const addBtn = target.closest('[data-action="add-endpoint"]');
        if (addBtn && this.contains(addBtn)) {
            e.preventDefault();
            this._addRow();
            return;
        }

        const removeBtn = target.closest('[data-action="remove-endpoint"]');
        if (removeBtn && this.contains(removeBtn)) {
            e.preventDefault();
            // Do NOT re-index surviving rows: the increment-only counter leaves a
            // gap and `parseProviderDto` compacts it.
            removeBtn.closest('[data-role="endpoint-row"]')?.remove();
        }
    };

    connectedCallback(): void {
        if (!this._initialized) {
            this._initialized = true;
            this._render();
            const seeds = this._parseValue();
            if (seeds.length) seeds.forEach(seed => this._addRow(seed));
            else this._addRow();   // create mode: one empty row
        }
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    /** Parse the `value` attribute (a JSON array of endpoints) for edit-mode
     *  prefill. Absent / non-array / malformed → `[]` (→ one empty row). */
    private _parseValue(): EndpointSeed[] {
        const raw = this.getAttribute('value');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private _render(): void {
        // Tiny scoped inline styles (static admin pages can't carry a stylesheet),
        // matching `cms-headers-input`.
        this.style.display       = 'flex';
        this.style.flexDirection = 'column';
        this.style.gap           = '0.75rem';

        this._rowsContainer = document.createElement('p9r-stack');
        this._rowsContainer.setAttribute('gap', 'sm');
        this.appendChild(this._rowsContainer);

        this.appendChild(this._makeAddButton());
    }

    private _addRow(seed: EndpointSeed = {}): void {
        if (!this._rowsContainer) return;
        const idx = this._rowCount++;
        const row = document.createElement('p9r-stack');
        row.setAttribute('direction', 'row');
        row.setAttribute('gap', 'sm');
        row.setAttribute('align', 'end');
        row.dataset.role = 'endpoint-row';
        row.appendChild(this._makeInput(`endpoints.${idx}.endpointId`, 'Endpoint id', seed.endpointId));
        row.appendChild(this._makeMethodSelect(`endpoints.${idx}.method`, seed.method));
        row.appendChild(this._makeInput(`endpoints.${idx}.targetUrl`, 'https://api.example.com/path', seed.targetUrl));
        row.appendChild(this._makeRemoveButton());
        this._rowsContainer.appendChild(row);
    }

    private _makeInput(name: string, placeholder: string, value?: string): HTMLElement {
        const input = document.createElement('p9r-input');
        input.setAttribute('name', name);
        input.setAttribute('placeholder', placeholder);
        if (value != null) input.setAttribute('value', value);
        input.style.flex = '1';
        return input;
    }

    private _makeMethodSelect(name: string, value?: string): HTMLElement {
        const select = document.createElement('p9r-select');
        select.setAttribute('name', name);
        // Empty label: p9r-select falls back to showing `name` when no `label` is
        // set; the trigger already shows the selected method, so the label is noise.
        select.setAttribute('label', '');
        // Min width so the dropdown panel fits the longest method ("OPTIONS") without
        // truncating; the panel sizes to the trigger.
        select.style.minWidth = '7.5rem';
        for (const method of HTTP_METHODS) {
            const opt = document.createElement('option');
            opt.value = method;
            opt.textContent = method;
            select.appendChild(opt);
        }
        // Default to GET so the field always submits a valid method.
        const initial = value && (HTTP_METHODS as readonly string[]).includes(value) ? value : HTTP_METHODS[0];
        select.setAttribute('value', initial);
        return select;
    }

    private _makeRemoveButton(): HTMLElement {
        const btn = document.createElement('p9r-button');
        btn.setAttribute('variant', 'ghost');
        btn.setAttribute('color', 'danger');
        btn.setAttribute('aria-label', 'Remove endpoint');
        btn.dataset.action = 'remove-endpoint';
        btn.innerHTML = `
            <svg slot="icon-left" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        `;
        return btn;
    }

    private _makeAddButton(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'flex-start';

        const btn = document.createElement('p9r-button');
        btn.setAttribute('variant', 'ghost');
        btn.setAttribute('color',   'secondary');
        btn.dataset.action = 'add-endpoint';
        btn.innerHTML = `
            <svg slot="icon-left" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add endpoint
        `;
        wrapper.appendChild(btn);
        return wrapper;
    }
}

customElements.define('cms-endpoints-input', CmsEndpointsInput);
