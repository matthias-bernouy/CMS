import css from "./EndpointsInput.css" with { type: "text" };
import { makeAddButton } from "./controls";
import { makeEndpointRow } from "./rows";
import { addQueryParam } from "./inPanel";
import type { EndpointSeed } from "./shared";

/**
 * `<cms-endpoints-input>` — light-DOM repeating field for gateway endpoints.
 *
 * Each endpoint is a collapsible `<p9r-accordion-item>` (built in `rows.ts`) with
 * a `<p9r-tabs>` body: Infos (the three named controls) / In (path + query
 * params) / Out / Rules. The controls sit in LIGHT DOM so the parent
 * `<cms-form>`'s native `FormData` picks them up by name; the server-side
 * `parseProviderDto` reconstructs `endpoints[]` from those flat keys.
 *
 * Index `<n>` increments per row and never reuses — removing a row leaves a gap
 * the parser compacts, so deletes never collide.
 *
 * Prefill (edit mode): a `value` attribute holding a JSON array of endpoint
 * seeds renders one item per element on connect (safe because the admin's
 * template interpolation finalises the attribute BEFORE insertion). Present-but-
 * empty (`[]`) or malformed → ZERO rows; a fully ABSENT attribute → one starter.
 */
export class CmsEndpointsInput extends HTMLElement {

    private _rowCount = 0;
    private _initialized = false;
    private _rowsContainer: HTMLElement | null = null;

    private _onClick = (e: Event) => {
        const target = e.target as HTMLElement;

        const addBtn = target.closest('[data-action="add-endpoint"]');
        if (addBtn && this.contains(addBtn)) {
            // Append collapsed: opening here would fire the accordion height
            // transition (the "grows in from the bottom" glitch).
            e.preventDefault();
            this._addRow({})?.scrollIntoView({ block: 'nearest' });
            return;
        }

        const removeBtn = target.closest('[data-action="remove-endpoint"]');
        if (removeBtn && this.contains(removeBtn)) {
            // No re-index: the increment-only counter leaves a gap the parser compacts.
            e.preventDefault();
            removeBtn.closest('[data-role="endpoint-row"]')?.remove();
            return;
        }

        const addParam = target.closest('[data-action="add-query-param"]');
        if (addParam && this.contains(addParam)) {
            e.preventDefault();
            addQueryParam(addParam.closest('[data-role="query-params"]') as HTMLElement | null);
            return;
        }

        const removeParam = target.closest('[data-action="remove-query-param"]');
        if (removeParam && this.contains(removeParam)) {
            e.preventDefault();
            removeParam.closest('[data-role="query-param-row"]')?.remove();
        }
    };

    connectedCallback(): void {
        if (!this._initialized) {
            this._initialized = true;
            ensureStyles();
            this._render();
            const seeds = this._parseValue();
            if (seeds.length) seeds.forEach(seed => this._addRow(seed));          // edit: seed exactly
            else if (!this.hasAttribute('value')) this._addRow({});               // no attr → one starter
            // present-but-empty / malformed → zero rows (added via "Add endpoint").
        }
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    /** Parse the `value` attribute (a JSON array of endpoints). Absent / non-array
     *  / malformed → `[]`. */
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
        // Single-open accordion (no `multiple`): opening one item collapses the rest.
        this._rowsContainer = document.createElement('p9r-accordion');
        this.append(this._rowsContainer, makeAddButton());
    }

    private _addRow(seed: EndpointSeed = {}): HTMLElement | null {
        if (!this._rowsContainer) return null;
        const item = makeEndpointRow(this._rowCount++, seed);
        this._rowsContainer.appendChild(item);
        return item;
    }
}

let stylesInjected = false;
/** Inject the component stylesheet once. It's light DOM, so the sheet goes in the
 *  document head; every rule is scoped to the `cms-endpoints-input` tag. */
function ensureStyles(): void {
    if (stylesInjected || document.getElementById('cms-endpoints-input-styles')) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'cms-endpoints-input-styles';
    style.textContent = css;
    document.head.appendChild(style);
}

customElements.define('cms-endpoints-input', CmsEndpointsInput);
