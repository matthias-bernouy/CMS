import BubblesEvent from "src/control/core/dom/BubblesEvent";
import type { JSONSchema, NodeView } from "./types";
import { renderNode } from "./renderNode";

/**
 * `<cms-json-editor name="body"></cms-json-editor>`
 *
 * Form-associated structured JSON editor. Set `schema` (property) and
 * `value` (string) externally; the component renders a tree of inputs
 * whose composite read drives `setFormValue`. Also offers a "Raw JSON"
 * toggle that swaps the tree for a textarea — useful when the schema
 * is missing or the user wants to paste a payload verbatim.
 *
 * Strict mode: properties not declared in the schema are dropped on
 * render. The raw mode is the escape hatch for off-schema payloads.
 */
export class JsonEditor extends HTMLElement {

    static formAssociated = true;
    static get observedAttributes() { return ["schema", "value"]; }

    private _internals!: ElementInternals;
    private _schema:    JSONSchema | null = null;
    private _value:     unknown           = null;
    private _mode:      "structured" | "raw" = "structured";
    private _treeRead: (() => unknown) | null = null;
    private _content!: HTMLDivElement;
    private _modeBtn!: HTMLButtonElement;
    private _rawArea!: HTMLTextAreaElement;

    connectedCallback(): void {
        if (!this._internals) this._internals = this.attachInternals();
        if (this._content) return;
        this._build();
        const schemaAttr = this.getAttribute("schema");
        if (schemaAttr) this._schema = parseSchemaAttr(schemaAttr);
        if (!this._schema) this._mode = "raw";
        const valueAttr  = this.getAttribute("value");
        if (valueAttr !== null) this._value = parseSafe(valueAttr);
        this._render();
        this._publish();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null): void {
        if (!this._content) return;
        if (name === "schema") {
            this._schema = newVal ? parseSchemaAttr(newVal) : null;
            if (!this._schema) this._mode = "raw";
            this._render();
        } else if (name === "value") {
            this._value = newVal === null ? null : parseSafe(newVal);
            this._render();
            this._publish();
        }
    }

    set schema(s: JSONSchema | null) {
        this._schema = s;
        // Setting the schema is a fresh start — reset the mode so an
        // earlier raw-mode fallback (no schema available) doesn't pin
        // the editor to the textarea once a schema arrives.
        this._mode   = s ? "structured" : "raw";
        if (this._content) this._render();
    }
    get schema(): JSONSchema | null { return this._schema; }

    set value(raw: string) {
        this._value = parseSafe(raw);
        if (this._content) this._render();
        this._publish();
    }
    get value(): string { return JSON.stringify(this._value, null, 2); }

    private _build(): void {
        const header = document.createElement("div");
        header.className = "json-editor__header";

        this._modeBtn = document.createElement("button");
        this._modeBtn.type = "button";
        this._modeBtn.className = "json-btn json-btn--mode";
        this._modeBtn.addEventListener("click", () => this._toggleMode());
        header.appendChild(this._modeBtn);

        this._content = document.createElement("div");
        this._content.className = "json-editor__content";

        this._rawArea = document.createElement("textarea");
        this._rawArea.className = "json-editor__raw";
        this._rawArea.rows = 14;
        this._rawArea.spellcheck = false;
        this._rawArea.addEventListener("input", () => {
            this._value = parseSafe(this._rawArea.value, this._value);
            this._publish();
        });

        this.append(header, this._content);
        this.classList.add("json-editor");
    }

    private _render(): void {
        const hasSchema = this._schema !== null;
        this._modeBtn.textContent = this._mode === "raw" ? "Switch to structured" : "Switch to raw JSON";
        this._modeBtn.disabled    = !hasSchema && this._mode === "raw";

        this._content.innerHTML = "";
        if (this._mode === "raw" || !hasSchema) {
            this._rawArea.value = JSON.stringify(this._value, null, 2);
            this._content.appendChild(this._rawArea);
            this._treeRead = null;
            return;
        }

        const view: NodeView = renderNode(this._schema, this._value, () => this._publishFromTree());
        this._content.appendChild(view.el);
        this._treeRead = view.read;
    }

    private _toggleMode(): void {
        if (!this._schema) return;
        if (this._mode === "structured" && this._treeRead) {
            this._value = this._treeRead();
        }
        this._mode = this._mode === "structured" ? "raw" : "structured";
        this._render();
        this._publish();
    }

    private _publishFromTree(): void {
        if (!this._treeRead) return;
        this._value = this._treeRead();
        this._publish();
    }

    private _publish(): void {
        const serialized = JSON.stringify(this._value);
        this._internals.setFormValue(serialized);
        this.dispatchEvent(new BubblesEvent("change"));
    }
}

function parseSafe(raw: string, fallback: unknown = null): unknown {
    if (raw === undefined || raw === null || raw === "") return fallback;
    try { return JSON.parse(raw); }
    catch { return fallback; }
}

function parseSchemaAttr(raw: string): JSONSchema | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as JSONSchema : null;
    } catch { return null; }
}

customElements.define("cms-json-editor", JsonEditor);
