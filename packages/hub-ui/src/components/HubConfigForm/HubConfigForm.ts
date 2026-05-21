import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };
import { pickWidget, fieldEditable, makeInput, readValue, type Prop } from "./fields";

type Field = { name: string; prop: Prop; el: HTMLElement; widget: string };

/**
 * `<hub-config-form>` — renders one `<p9r-*>` input per top-level JSON-Schema
 * property (base.md §11 subset: string/number/integer/boolean/array-of-enum;
 * widgets text/textarea/password/select/select-multiple/toggle/number/date;
 * `x-writable-by`, `writeOnly`, `x-group`). Nested objects + `x-visible-if`
 * are NOT supported (advisory only).
 *
 * Attrs: `schema` (JSON), `value` (JSON), `mode` (tenant|control-plane),
 *        `prefix` (dotted name prefix → `denestDottedKeys` server-side).
 * API:   `.getValues()`, `.isValid()`, `.rebuild()`.
 */
export class HubConfigForm extends Component {
    private _schema: Prop | null = null;
    private _value: Record<string, any> = {};
    private _fields: Field[] = [];

    constructor() {
        super({ css: css as unknown as string, template: "<div part='form'></div>" });
    }

    override connectedCallback() {
        this._schema = this._parse("schema");
        this._value  = this._parse("value") ?? {};
        this.rebuild();
    }

    get mode(): string    { return this.getAttribute("mode")   || "tenant"; }
    private get _prefix(): string { return this.getAttribute("prefix") || ""; }

    private _parse(attr: string): any {
        const raw = this.getAttribute(attr);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    private get _root(): HTMLElement { return this.shadowRoot!.querySelector("[part='form']") as HTMLElement; }

    rebuild() {
        const root = this._root;
        root.innerHTML = "";
        this._fields = [];
        if (!this._schema || typeof this._schema !== "object") return;
        const props = this._schema.properties || {};
        const required = new Set(this._schema.required || []);
        const groups = new Map<string, HTMLElement[]>();

        for (const [name, prop] of Object.entries<Prop>(props)) {
            if (prop.writeOnly && this.mode === "tenant") continue;
            const editable = fieldEditable(prop, this._schema, this.mode);
            const widget   = pickWidget(prop);
            const fullName = this._prefix ? `${this._prefix}.${name}` : name;
            const initial  = this._value[name] !== undefined ? this._value[name] : prop.default;
            const el = makeInput(fullName, prop, initial, widget, editable);
            (el as HTMLElement).dataset.fieldName = name;
            if (required.has(name)) el.setAttribute("required", "");
            el.addEventListener("change", () => this._emitChange());
            el.addEventListener("input",  () => this._emitChange());
            this._fields.push({ name, prop, el, widget });
            const group = prop["x-group"] || "default";
            (groups.get(group) ?? groups.set(group, []).get(group)!).push(el);
        }

        for (const [group, els] of groups) {
            if (group !== "default") {
                const h = document.createElement("h4");
                h.className = "group"; h.textContent = group;
                root.appendChild(h);
            }
            for (const el of els) root.appendChild(el);
        }
    }

    private _emitChange() {
        this.dispatchEvent(new CustomEvent("hub-config-change", {
            detail: { values: this.getValues(), valid: this.isValid() },
            bubbles: true, composed: true,
        }));
    }

    getValues(): Record<string, any> {
        const out: Record<string, any> = {};
        for (const { name, prop, el, widget } of this._fields) {
            const v = readValue(el, prop, widget);
            if (v !== undefined) out[name] = v;
        }
        return out;
    }

    isValid(): boolean {
        const values = this.getValues();
        for (const r of new Set<string>((this._schema?.required) || [])) {
            const v = values[r];
            if (v === undefined || v === null || v === "") return false;
            if (Array.isArray(v) && v.length === 0) return false;
        }
        return true;
    }
}

if (!customElements.get("hub-config-form")) customElements.define("hub-config-form", HubConfigForm);
