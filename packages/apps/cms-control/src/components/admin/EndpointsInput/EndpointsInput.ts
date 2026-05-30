import { HTTP_METHODS } from "@bernouy/cms-gateway";

/**
 * `<cms-endpoints-input>` — light-DOM repeating field for gateway endpoints.
 *
 * Each endpoint is a collapsible `<p9r-accordion-item>` whose collapsed header
 * summarises it (a method colour-tag + endpoint id + path, kept live as the
 * fields change). The expanded body is a `<p9r-tabs>` shell:
 *   - "Infos" (active): the three editable controls named `endpoints.<n>.endpointId`,
 *     `endpoints.<n>.method`, `endpoints.<n>.targetUrl`, laid out in a row;
 *   - "In" / "Out" / "Rules": disabled placeholders (params / output / auth — deferred).
 * A "Delete endpoint" button sits at the bottom of the body.
 *
 * The controls sit in light DOM, so the parent `<cms-form>`'s native `FormData`
 * collection picks them up by name regardless of nesting; the server-side
 * `parseProviderDto` reconstructs the `endpoints[]` array from those flat keys.
 *
 * Index `<n>` increments per row and never reuses — removing a row leaves a gap,
 * and the parser compacts sparse indices, so deletes never collide.
 *
 * Prefill (edit mode): a `value` attribute holding a JSON array of
 * `{endpointId, method, targetUrl}` seeds one item per element on connect. This
 * connect-time read is safe because the admin's template interpolation rewrites
 * the `value` attribute to its final string BEFORE the element is inserted into
 * the live DOM (see `render.ts`). A present-but-empty (`[]`) or malformed `value`
 * seeds ZERO rows; only a fully ABSENT `value` attribute seeds one starter row.
 */
type EndpointSeed = { endpointId?: string; method?: string; targetUrl?: string };

/** Read the current value of a p9r-input / p9r-select host (both expose `.value`). */
const liveValue = (el: Element): string => (el as unknown as { value?: string }).value ?? '';

/** Colour the method tag like a REST client (GET green, DELETE red, …). */
const METHOD_COLOR: Record<string, string> = {
    GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger',
};
const methodColor = (m: string): string => METHOD_COLOR[m] ?? 'primary';

export class CmsEndpointsInput extends HTMLElement {

    private _rowCount = 0;
    private _initialized = false;
    private _rowsContainer: HTMLElement | null = null;

    private _onClick = (e: Event) => {
        const target = e.target as HTMLElement;

        const addBtn = target.closest('[data-action="add-endpoint"]');
        if (addBtn && this.contains(addBtn)) {
            e.preventDefault();
            // Append collapsed: opening it here would trigger the accordion's
            // height transition (the "grows in from the bottom" glitch). The user
            // clicks the new row to expand + fill it.
            const item = this._addRow({});
            item?.scrollIntoView({ block: 'nearest' });
            return;
        }

        const removeBtn = target.closest('[data-action="remove-endpoint"]');
        if (removeBtn && this.contains(removeBtn)) {
            e.preventDefault();
            // Do NOT re-index surviving rows: the increment-only counter leaves a
            // gap and `parseProviderDto` compacts it. The marker is on the accordion
            // item, so this removes the whole endpoint (header + body).
            removeBtn.closest('[data-role="endpoint-row"]')?.remove();
        }
    };

    connectedCallback(): void {
        if (!this._initialized) {
            this._initialized = true;
            this._render();
            const seeds = this._parseValue();
            if (seeds.length) {
                seeds.forEach(seed => this._addRow(seed));          // edit: seed exactly, all collapsed
            } else if (!this.hasAttribute('value')) {
                this._addRow({});                                   // no value attr → one starter row (defensive)
            }
            // value present but empty (`[]`) or malformed → zero rows; the provider
            // starts with no endpoints and the user adds them via "Add endpoint".
        }
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    /** Parse the `value` attribute (a JSON array of endpoints) for edit-mode
     *  prefill. Absent / non-array / malformed → `[]`. */
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
        this.style.display       = 'flex';
        this.style.flexDirection = 'column';
        this.style.gap           = '0.75rem';

        // Single-open accordion (no `multiple`): opening one item collapses the others.
        this._rowsContainer = document.createElement('p9r-accordion');
        this.appendChild(this._rowsContainer);

        this.appendChild(this._makeAddButton());
    }

    private _addRow(seed: EndpointSeed = {}): HTMLElement | null {
        const container = this._rowsContainer;
        if (!container) return null;
        const idx = this._rowCount++;
        // Coerce the method once and seed BOTH the header tag and the select with it,
        // so they never disagree on load (the select coerces the same way internally).
        const method = seed.method && (HTTP_METHODS as readonly string[]).includes(seed.method)
            ? seed.method : HTTP_METHODS[0];

        const item = document.createElement('p9r-accordion-item');
        item.dataset.role = 'endpoint-row';   // single marker, on the item only

        // ── Collapsed-header summary (slot="header"); kept in sync below ──
        const header = document.createElement('span');
        header.setAttribute('slot', 'header');
        header.style.cssText = 'display:flex; align-items:center; gap:0.6rem; flex:1; min-width:0;';

        const methodTag = document.createElement('p9r-tag');
        methodTag.dataset.display = 'method';
        methodTag.setAttribute('color', methodColor(method));
        methodTag.textContent = method;

        const idEl = document.createElement('strong');
        idEl.dataset.display = 'endpointId';
        idEl.textContent = seed.endpointId || '(new endpoint)';
        idEl.style.cssText = 'flex:0 0 auto; white-space:nowrap;';

        const pathEl = document.createElement('span');
        pathEl.dataset.display = 'targetUrl';
        pathEl.textContent = seed.targetUrl || '';
        pathEl.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color: var(--text-muted, #94a3b8); font-family: ui-monospace, monospace; font-size:0.85em;';

        header.append(methodTag, idEl, pathEl);

        // ── Body: a tabs shell (the three fields live in "Infos") ──
        const tabs = document.createElement('p9r-tabs');

        // "Infos" — the three editable controls, stacked vertically, each labelled.
        const infos = document.createElement('p9r-tab-panel');
        infos.id = `infos-${idx}`;
        infos.setAttribute('label', 'Infos');
        const infosBody = document.createElement('p9r-stack');
        infosBody.setAttribute('gap', 'm');
        const idInput     = this._makeInput(`endpoints.${idx}.endpointId`, 'Endpoint id', 'getUser', seed.endpointId);
        const methodSelect = this._makeMethodSelect(`endpoints.${idx}.method`, method);
        const urlInput    = this._makeInput(`endpoints.${idx}.targetUrl`, 'Target URL', 'https://api.example.com/path', seed.targetUrl);
        infosBody.append(idInput, methodSelect, urlInput);
        infos.appendChild(infosBody);

        // Deferred tabs (disabled placeholders): params / output / auth.
        tabs.append(
            infos,
            this._makeDeferredPanel(`in-${idx}`, 'In'),
            this._makeDeferredPanel(`out-${idx}`, 'Out'),
            this._makeDeferredPanel(`rules-${idx}`, 'Rules'),
        );
        tabs.setAttribute('active', `infos-${idx}`);   // panels already appended → no first-rebuild race

        // slot="header" → summary; slot="header-actions" → the delete button (a
        // sibling of the toggle buttons, so it neither nests nor toggles); default
        // slot → the tabs.
        item.append(header, this._makeDeleteButton(), tabs);
        this._bindHeaderSync(methodTag, idEl, pathEl, idInput, methodSelect, urlInput);

        // Always inserted COLLAPSED so no accordion height transition fires on
        // insert; the user expands a row (single-open, smooth) by clicking it.
        container.appendChild(item);
        return item;
    }

    /** Keep the collapsed-header summary in sync with the body controls as the
     *  user edits. `input` is composed (crosses the input's shadow), and p9r-select
     *  re-dispatches `change` on its host — so both on each control covers every
     *  edit. Writes via `textContent`/attributes only (no innerHTML). */
    private _bindHeaderSync(
        methodTag: Element, idEl: Element, pathEl: Element,
        idInput: Element, methodSelect: Element, urlInput: Element,
    ): void {
        const update = () => {
            const m = liveValue(methodSelect) || HTTP_METHODS[0];
            methodTag.textContent = m;
            methodTag.setAttribute('color', methodColor(m));
            idEl.textContent   = liveValue(idInput).trim() || '(new endpoint)';
            pathEl.textContent = liveValue(urlInput);
        };
        for (const el of [idInput, methodSelect, urlInput]) {
            el.addEventListener('input', update);
            el.addEventListener('change', update);
        }
    }

    private _makeInput(name: string, label: string, placeholder: string, value?: string): HTMLElement {
        const input = document.createElement('p9r-input');
        input.setAttribute('name', name);
        input.setAttribute('label', label);
        input.setAttribute('placeholder', placeholder);
        if (value != null) input.setAttribute('value', value);
        return input;
    }

    private _makeMethodSelect(name: string, value?: string): HTMLElement {
        const select = document.createElement('p9r-select');
        select.setAttribute('name', name);
        select.setAttribute('label', 'Method');
        for (const m of HTTP_METHODS) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            select.appendChild(opt);
        }
        const initial = value && (HTTP_METHODS as readonly string[]).includes(value) ? value : HTTP_METHODS[0];
        select.setAttribute('value', initial);
        return select;
    }

    /** A disabled tab panel for a feature not built yet (params / output / rules). */
    private _makeDeferredPanel(id: string, label: string): HTMLElement {
        const panel = document.createElement('p9r-tab-panel');
        panel.id = id;
        panel.setAttribute('label', label);
        panel.setAttribute('disabled', '');
        const note = document.createElement('p');
        note.textContent = 'Soon.';
        note.style.cssText = 'margin:0; color: var(--text-muted, #94a3b8); font-size:13px;';
        panel.appendChild(note);
        return panel;
    }

    /** Icon-only delete in the accordion header's `header-actions` slot. Uses the
     *  dedicated `p9r-icon-button` (a square, properly-sized icon button) and sits
     *  OUTSIDE the toggle buttons → no nested-button, no accidental toggle. */
    private _makeDeleteButton(): HTMLElement {
        const btn = document.createElement('p9r-icon-button');
        btn.setAttribute('slot', 'header-actions');
        btn.setAttribute('variant', 'ghost');
        btn.setAttribute('color', 'danger');
        btn.setAttribute('size', 'sm');
        btn.setAttribute('aria-label', 'Delete endpoint');
        btn.dataset.action = 'remove-endpoint';
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
        `;
        return btn;
    }

    /** Full-width dashed "add row" affordance (a native button → `type="button"`
     *  so it never submits the form). Inline styles only (static admin pages carry
     *  no stylesheet); hover is wired with listeners. */
    private _makeAddButton(): HTMLElement {
        const idle  = 'var(--border-default, #d1d5db)';
        const muted = 'var(--text-muted, #6b7280)';
        const accent = 'var(--primary-base, #4361ee)';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.action = 'add-endpoint';
        btn.style.cssText = [
            'width:100%', 'display:flex', 'align-items:center', 'justify-content:center', 'gap:0.5rem',
            'padding:0.8rem', `border:1.5px dashed ${idle}`, 'border-radius:8px',
            'background:transparent', `color:${muted}`, 'font:inherit', 'font-weight:600',
            'font-size:14px', 'cursor:pointer', 'transition:border-color .15s ease, color .15s ease',
        ].join(';');
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add endpoint
        `;
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = accent; btn.style.color = accent; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = idle;   btn.style.color = muted; });
        return btn;
    }
}

customElements.define('cms-endpoints-input', CmsEndpointsInput);
