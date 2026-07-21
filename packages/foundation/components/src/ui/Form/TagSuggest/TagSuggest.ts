import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
import type { Suggestion } from "./types";
import { upgradeProperty } from "./compute";
import { loadSuggestions } from "./domain/api";
import { renderTagList, update } from "./domain/state";
import { computeValueString, parseValueString } from "./domain/selection";
import { onFocus, onBlur, onInput, onKeyDown } from "./listener";
const css = baseCss + variantCss;
export class TagSuggest extends Component {
    static formAssociated = true;
    static get observedAttributes() {
        return ["placeholder", "mode", "resource", "api", "disabled", "value"];
    }
    _internals: ElementInternals;
    _tags: string[] = [];
    _suggestions: Suggestion[] = [];
    _activeIndex: number = -1;
    _input: HTMLInputElement | null;
    _display: HTMLElement | null;
    _suggestionsEl: HTMLElement | null;
    _liveRegion: HTMLElement | null;
    _allSuggestions: Suggestion[] = [];
    _uid: string;
    _defaultValue: string = "";
    _defaultsCaptured: boolean = false;
    _silent: boolean = false;
    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        const r = this.shadowRoot!;
        this._input = r.querySelector("#main-input");
        this._display = r.querySelector("#tags-display");
        this._suggestionsEl = r.querySelector("#suggestions");
        this._liveRegion = r.querySelector("#live-region");
        this._uid = `ts-${Math.random().toString(36).slice(2, 9)}`;
        if (this._suggestionsEl) {
            this._suggestionsEl.id = `${this._uid}-listbox`;
        }
        if (this._input) {
            this._input.setAttribute("aria-controls", `${this._uid}-listbox`);
        }
    }
    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultValue = this.getAttribute("value") ?? "";
            this._defaultsCaptured = true;
        }
        ["placeholder", "mode", "resource", "api", "disabled", "value"].forEach((p) => upgradeProperty(this, p));
        this._input?.addEventListener("input", this._onInput);
        this._input?.addEventListener("keydown", this._onKeyDown);
        this._input?.addEventListener("focus", this._onFocus);
        this._input?.addEventListener("blur", this._onBlur);
        loadSuggestions(this).then((data) => {
            if (data) {
                this._allSuggestions = data;
            }
        });
    }

    disconnectedCallback() {
        this._input?.removeEventListener("input", this._onInput);
        this._input?.removeEventListener("keydown", this._onKeyDown);
        this._input?.removeEventListener("focus", this._onFocus);
        this._input?.removeEventListener("blur", this._onBlur);
    }

    formResetCallback() {
        this._silent = true;
        try {
            this.value = this._defaultValue;
        } finally {
            this._silent = false;
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) {
            return;
        }
        if (name === "placeholder") {
            this._input.placeholder = newVal ?? "";
        } else if (name === "disabled") {
            this._input.disabled = this.hasAttribute("disabled");
        } else if (name === "resource" || name === "api") {
            this._allSuggestions = [];
            loadSuggestions(this).then((data) => {
                if (data) {
                    this._allSuggestions = data;
                }
            });
        } else if (name === "mode") {
            renderTagList(this);
        } else if (name === "value") {
            this.value = newVal ?? "";
        }
    }

    private _onFocus = () => onFocus(this, this._input);
    private _onBlur = () => onBlur(this);
    private _onInput = () => onInput(this, this._input);
    private _onKeyDown = (e: KeyboardEvent) => onKeyDown(this, this._input, e);
    get value(): string {
        return computeValueString(this.getAttribute("mode") || "multiple", this._tags);
    }
    set value(v: string) {
        const mode = this.getAttribute("mode") || "multiple";
        this._tags = parseValueString(mode, v);
        if (this._input) {
            this._input.value = mode === "multiple" ? "" : (this._tags[0] ?? "");
        }
        update(this);
    }

    get name() {
        return this.getAttribute("name") || "";
    }
    get placeholder() {
        return this.getAttribute("placeholder") || "";
    }
    set placeholder(v: string) {
        v ? this.setAttribute("placeholder", v) : this.removeAttribute("placeholder");
    }
    get mode() {
        return this.getAttribute("mode") || "multiple";
    }
    set mode(v: string) {
        v ? this.setAttribute("mode", v) : this.removeAttribute("mode");
    }
    get resource() {
        return this.getAttribute("resource") || "";
    }
    set resource(v: string) {
        v ? this.setAttribute("resource", v) : this.removeAttribute("resource");
    }
    get api() {
        return this.getAttribute("api") || "";
    }
    set api(v: string) {
        v ? this.setAttribute("api", v) : this.removeAttribute("api");
    }
    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(v: boolean) {
        v ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get tags() {
        return [...this._tags];
    }
}
