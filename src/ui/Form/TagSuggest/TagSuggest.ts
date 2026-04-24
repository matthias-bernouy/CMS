import { Component } from "../../../base/Component";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "../../Tag/Tag";

type Suggestion = { value: string; count: number };

/**
 * Form-associated autocomplete input.
 *
 * Attributes:
 * - `name`          : form field name (emitted via ElementInternals.setFormValue)
 * - `mode`          : "single" (default) or "multiple". Multiple stores a
 *                     comma-separated list of tags.
 * - `resource`      : "pages" | "snippets" | "templates" — used to fetch the
 *                     existing values from `GET {api}?resource=...`
 * - `api`           : API base path for the tags endpoint. Defaults to
 *                     `../api/tags`. Override to `../../api/tags` when the
 *                     component is embedded two levels deep.
 * - `placeholder`   : input placeholder
 * - `disabled`      : disables the input
 *
 * Value format emitted to the form:
 * - single  : a single string, e.g. "hero"
 * - multiple: comma-joined, e.g. "hero,layout,cta"
 */
export class TagSuggest extends Component {
    static formAssociated = true;

    private _internals: ElementInternals;
    private _tags: string[] = [];
    private _suggestions: Suggestion[] = [];
    private _activeIndex: number = -1;
    private _input: HTMLInputElement | null;
    private _display: HTMLElement | null;
    private _suggestionsEl: HTMLElement | null;
    private _liveRegion: HTMLElement | null;
    private _loaded: boolean = false;
    private _allSuggestions: Suggestion[] = [];
    private _uid: string;

    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string,
        });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('#main-input') as HTMLInputElement | null;
        this._display = this.shadowRoot?.querySelector('#tags-display') ?? null;
        this._suggestionsEl = this.shadowRoot?.querySelector('#suggestions') ?? null;
        this._liveRegion = this.shadowRoot?.querySelector('#live-region') ?? null;
        this._uid = `ts-${Math.random().toString(36).slice(2, 9)}`;

        if (this._suggestionsEl) {
            this._suggestionsEl.id = `${this._uid}-listbox`;
        }
        if (this._input) {
            this._input.setAttribute('aria-controls', `${this._uid}-listbox`);
        }
    }

    static get observedAttributes() {
        return ['placeholder', 'mode', 'resource', 'api', 'disabled'];
    }

    override connectedCallback() {
        for (const prop of ['placeholder', 'mode', 'resource', 'api', 'disabled', 'value']) {
            this._upgradeProperty(prop);
        }

        if (this._input) {
            this._input.addEventListener('input', this._onInput);
            this._input.addEventListener('keydown', this._onKeyDown);
            this._input.addEventListener('focus', this._onFocus);
            this._input.addEventListener('blur', this._onBlur);
        }

        this._loadSuggestions();
    }

    disconnectedCallback() {
        if (this._input) {
            this._input.removeEventListener('input', this._onInput);
            this._input.removeEventListener('keydown', this._onKeyDown);
            this._input.removeEventListener('focus', this._onFocus);
            this._input.removeEventListener('blur', this._onBlur);
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;
        if (name === 'placeholder') {
            this._input.placeholder = newVal ?? '';
        } else if (name === 'disabled') {
            this._input.disabled = this.hasAttribute('disabled');
        } else if (name === 'resource' || name === 'api') {
            this._loaded = false;
            this._allSuggestions = [];
            this._loadSuggestions();
        } else if (name === 'mode') {
            this._renderTags();
        }
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private async _loadSuggestions() {
        const resource = this.getAttribute('resource');
        if (!resource) return;

        const apiBase = this.getAttribute('api') || '../api/tags';
        const url = new URL(apiBase, window.location.href);
        url.searchParams.set('resource', resource);

        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json() as Suggestion[];
            this._allSuggestions = data;
            this._loaded = true;
        } catch {
            /* offline / ignore */
        }
    }

    private _onFocus = () => {
        if (!this._loaded || !this._input) return;
        const query = this._input.value.trim().toLowerCase();
        this._refreshSuggestions(query);
    };

    private _onBlur = () => {
        // Delay so click on suggestion still fires.
        setTimeout(() => this._hideSuggestions(), 150);
    };

    private _onInput = () => {
        if (!this._input) return;
        const query = this._input.value.trim().toLowerCase();
        this._refreshSuggestions(query);
    };

    private _onKeyDown = (e: KeyboardEvent) => {
        if (!this._input) return;
        const mode = this.getAttribute('mode') || 'single';

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this._suggestions.length === 0) return;
            this._activeIndex = Math.min(this._activeIndex + 1, this._suggestions.length - 1);
            this._renderSuggestions();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this._suggestions.length === 0) return;
            this._activeIndex = Math.max(this._activeIndex - 1, -1);
            this._renderSuggestions();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const picked = this._activeIndex >= 0 ? this._suggestions[this._activeIndex] : undefined;
            if (picked) {
                this._select(picked.value);
            } else {
                const val = this._input.value.trim();
                if (val) this._select(val);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this._hideSuggestions();
        } else if (e.key === 'Backspace' && this._input.value === '' && mode === 'multiple') {
            this._removeLastTag();
        } else if (e.key === ',' && mode === 'multiple') {
            e.preventDefault();
            const val = this._input.value.trim();
            if (val) this._select(val);
        }
    };

    private _select(value: string) {
        const mode = this.getAttribute('mode') || 'single';
        const trimmed = value.trim();
        if (!trimmed || !this._input) return;

        if (mode === 'multiple') {
            if (!this._tags.includes(trimmed)) {
                this._tags.push(trimmed);
                this._announce(`${trimmed} added`);
            }
            this._input.value = '';
        } else {
            this._tags = [trimmed];
            this._input.value = trimmed;
            this._announce(`${trimmed} selected`);
        }
        this._activeIndex = -1;
        this._update();
        this._hideSuggestions();
    }

    private _removeTagAt(index: number) {
        const removed = this._tags[index];
        if (removed === undefined) return;
        this._tags.splice(index, 1);
        this._announce(`${removed} removed`);
        this._update();
        this._input?.focus();
    }

    private _removeLastTag() {
        if (this._tags.length === 0) return;
        this._removeTagAt(this._tags.length - 1);
    }

    private _update() {
        this._renderTags();
        this._internals.setFormValue(this.value);
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this.value, tags: [...this._tags] },
        }));
    }

    private _renderTags() {
        if (!this._display) return;
        const mode = this.getAttribute('mode') || 'single';
        this._display.innerHTML = '';
        if (mode !== 'multiple') return;

        this._tags.forEach((tag, index) => {
            const el = document.createElement('p9r-tag');
            el.setAttribute('color', 'primary');
            el.setAttribute('part', 'chip');
            el.setAttribute('role', 'listitem');
            el.textContent = tag;
            el.title = `Remove ${tag}`;
            el.setAttribute('aria-label', `Remove ${tag}`);
            el.addEventListener('click', () => this._removeTagAt(index));
            this._display!.appendChild(el);
        });
    }

    private _refreshSuggestions(query: string) {
        const mode = this.getAttribute('mode') || 'single';
        const current = mode === 'multiple' ? this._tags : [];

        const pool = this._allSuggestions.filter(s => !current.includes(s.value));

        if (query === '') {
            this._suggestions = pool.slice(0, 8);
        } else {
            this._suggestions = pool
                .filter(s => s.value.toLowerCase().includes(query))
                .slice(0, 8);
        }
        this._activeIndex = -1;
        this._renderSuggestions();
    }

    private _renderSuggestions() {
        if (!this._suggestionsEl || !this._input) return;
        if (this._suggestions.length === 0) {
            this._hideSuggestions();
            return;
        }

        this._suggestionsEl.innerHTML = '';
        this._suggestions.forEach((s, i) => {
            const row = document.createElement('div');
            row.className = 'suggestion';
            row.id = `${this._uid}-opt-${i}`;
            row.setAttribute('role', 'option');
            row.setAttribute('part', 'option');
            const active = i === this._activeIndex;
            row.dataset.active = String(active);
            row.setAttribute('aria-selected', String(active));

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = s.value;
            row.appendChild(name);

            const badge = document.createElement('p9r-tag');
            badge.setAttribute('color', 'secondary');
            badge.setAttribute('part', 'count');
            badge.textContent = String(s.count);
            row.appendChild(badge);

            row.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                this._select(s.value);
            });

            this._suggestionsEl!.appendChild(row);
        });
        this._suggestionsEl.hidden = false;
        this._input.setAttribute('aria-expanded', 'true');

        if (this._activeIndex >= 0) {
            this._input.setAttribute(
                'aria-activedescendant',
                `${this._uid}-opt-${this._activeIndex}`,
            );
        } else {
            this._input.removeAttribute('aria-activedescendant');
        }
    }

    private _hideSuggestions() {
        if (this._suggestionsEl) this._suggestionsEl.hidden = true;
        this._activeIndex = -1;
        if (this._input) {
            this._input.setAttribute('aria-expanded', 'false');
            this._input.removeAttribute('aria-activedescendant');
        }
    }

    private _announce(message: string) {
        if (!this._liveRegion) return;
        this._liveRegion.textContent = '';
        // Force re-announcement by rewriting on next tick.
        window.setTimeout(() => {
            if (this._liveRegion) this._liveRegion.textContent = message;
        }, 10);
    }

    get value(): string {
        const mode = this.getAttribute('mode') || 'single';
        if (mode === 'multiple') return this._tags.join(',');
        return this._tags[0] || '';
    }

    set value(v: string) {
        const mode = this.getAttribute('mode') || 'single';
        if (mode === 'multiple') {
            this._tags = v ? v.split(',').map(t => t.trim()).filter(t => t !== '') : [];
            if (this._input) this._input.value = '';
        } else {
            this._tags = v ? [v.trim()] : [];
            if (this._input) this._input.value = this._tags[0] || '';
        }
        this._update();
    }

    get name(): string {
        return this.getAttribute('name') || '';
    }

    get placeholder(): string {
        return this.getAttribute('placeholder') || '';
    }

    set placeholder(v: string) {
        if (v) this.setAttribute('placeholder', v);
        else this.removeAttribute('placeholder');
    }

    get mode(): string {
        return this.getAttribute('mode') || 'single';
    }

    set mode(v: string) {
        if (v) this.setAttribute('mode', v);
        else this.removeAttribute('mode');
    }

    get resource(): string {
        return this.getAttribute('resource') || '';
    }

    set resource(v: string) {
        if (v) this.setAttribute('resource', v);
        else this.removeAttribute('resource');
    }

    get api(): string {
        return this.getAttribute('api') || '';
    }

    set api(v: string) {
        if (v) this.setAttribute('api', v);
        else this.removeAttribute('api');
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled');
    }

    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get tags(): string[] {
        return [...this._tags];
    }
}

if (!customElements.get('p9r-tag-suggest')) {
    customElements.define('p9r-tag-suggest', TagSuggest);
}
