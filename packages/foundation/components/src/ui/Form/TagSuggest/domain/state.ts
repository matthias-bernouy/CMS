import { announce } from "../compute";
import { renderTags, renderSuggestions, hideSuggestions } from "./render";
import { filterSuggestions } from "./selection";
import type { Suggestion } from "../types";

export interface TagState {
    _tags: string[];
    _suggestions: Suggestion[];
    _activeIndex: number;
    _allSuggestions: Suggestion[];
    _input: HTMLInputElement | null;
    _display: HTMLElement | null;
    _suggestionsEl: HTMLElement | null;
    _liveRegion: HTMLElement | null;
    _uid: string;
    _silent: boolean;
    readonly value: string;
    _internals: ElementInternals;
}

const view = (host: HTMLElement) => host as unknown as HTMLElement & TagState;

export const select = (host: HTMLElement, raw: string) => {
    const h = view(host);
    const mode = host.getAttribute("mode") || "multiple";
    const trimmed = raw.trim();
    if (!trimmed || !h._input) {
        return;
    }

    if (mode === "multiple") {
        if (!h._tags.includes(trimmed)) {
            h._tags.push(trimmed);
            announce(h._liveRegion, `${trimmed} added`);
        }
        h._input.value = "";
    } else {
        h._tags = [trimmed];
        h._input.value = trimmed;
        announce(h._liveRegion, `${trimmed} selected`);
    }
    h._activeIndex = -1;
    update(host);
    hide(host);
};

/**
 * Sync `_tags` to the raw input value in single mode without touching the
 * input field or hiding suggestions — the user is still typing. Makes
 * `mode="single"` behave like a regular text input: the typed value is
 * picked up by FormData on submit, no Enter required.
 */
export const liveSelectSingle = (host: HTMLElement, raw: string) => {
    const h = view(host);
    const trimmed = raw.trim();
    h._tags = trimmed ? [trimmed] : [];
    h._internals.setFormValue(h.value);
    if (h._silent) {
        return;
    }
    host.dispatchEvent(
        new CustomEvent("change", {
            bubbles: true,
            composed: true,
            detail: { value: h.value, tags: [...h._tags] },
        }),
    );
};

export const removeTagAt = (host: HTMLElement, index: number) => {
    const h = view(host);
    const removed = h._tags[index];
    if (removed === undefined) {
        return;
    }
    h._tags.splice(index, 1);
    announce(h._liveRegion, `${removed} removed`);
    update(host);
    h._input?.focus();
};

export const removeLastTag = (host: HTMLElement) => {
    const h = view(host);
    if (h._tags.length === 0) {
        return;
    }
    removeTagAt(host, h._tags.length - 1);
};

export const update = (host: HTMLElement) => {
    const h = view(host);
    renderTagList(host);
    h._internals.setFormValue(h.value);
    if (h._silent) {
        return;
    }
    host.dispatchEvent(
        new CustomEvent("change", {
            bubbles: true,
            composed: true,
            detail: { value: h.value, tags: [...h._tags] },
        }),
    );
};

export const renderTagList = (host: HTMLElement) => {
    const h = view(host);
    renderTags(h._display, host.getAttribute("mode") || "multiple", h._tags, (i) => removeTagAt(host, i));
};

export const refreshSuggestions = (host: HTMLElement, query: string) => {
    const h = view(host);
    const mode = host.getAttribute("mode") || "multiple";
    const current = mode === "multiple" ? h._tags : [];
    h._suggestions = filterSuggestions(h._allSuggestions, current, query);
    h._activeIndex = -1;
    renderList(host);
};

export const renderList = (host: HTMLElement) => {
    const h = view(host);
    renderSuggestions(h._suggestionsEl, h._input, h._suggestions, h._activeIndex, h._uid, (v) => select(host, v));
};

export const hide = (host: HTMLElement) => {
    const h = view(host);
    hideSuggestions(h._suggestionsEl, h._input);
    h._activeIndex = -1;
};
