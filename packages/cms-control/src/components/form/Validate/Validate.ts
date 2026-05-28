import { CustomHTMLElement } from "../../CustomHTMLElement";

type ValidationResult = {
    valid: boolean;
    message?: string;
    errors?: Record<string, string>;
};

type ValueElement = HTMLElement & { value: string; name: string };

export default class CmsValidate extends CustomHTMLElement {

    private _abort: AbortController | null = null;
    private _debounceId: number | null = null;

    static override get observedAttributes(): string[] {
        return [ "url", "on", "method", "debounce" ];
    }

    connectedCallback() {
        this.style.display = "contents";
        this.addEventListener(this._trigger, this._onTriggered);
    }

    override disconnectedCallback(): void {
        this.removeEventListener(this._trigger, this._onTriggered);
        this._abort?.abort();
        if (this._debounceId !== null) clearTimeout(this._debounceId);
    }

    override attributeChangedCallback(): void {}

    private get _trigger(): string {
        return this.getAttribute("on") || "change";
    }

    private _onTriggered = () => {
        const wait = Number(this.getAttribute("debounce") ?? 200);
        if (this._debounceId !== null) clearTimeout(this._debounceId);
        this._debounceId = window.setTimeout(() => this._validate(), wait);
    };

    private _fields(): ValueElement[] {
        return Array.from(this.querySelectorAll<HTMLElement>("[name]"))
            .filter((el): el is ValueElement => typeof (el as any).value === "string");
    }

    private async _validate() {
        const url = this.getAttribute("url");
        if (!url) return;

        const fields = this._fields();
        const payload: Record<string, string> = {};
        for (const f of fields) payload[f.name] = f.value;

        this._abort?.abort();
        this._abort = new AbortController();

        let result: ValidationResult;
        try {
            const res = await fetch(url, {
                method: this.getAttribute("method") || "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: this._abort.signal,
            });
            if (!res.ok) return;
            result = await res.json() as ValidationResult;
        } catch (err) {
            if ((err as DOMException).name !== "AbortError") {
                this.dispatchEvent(new CustomEvent("validate-error", { bubbles: true, detail: err }));
            }
            return;
        }

        this._applyResult(result, fields);
    }

    private _applyResult(result: ValidationResult, fields: ValueElement[]) {
        if (result.valid) {
            for (const f of fields) this._setValidity(f, "");
        } else if (result.errors) {
            for (const f of fields) this._setValidity(f, result.errors[f.name] ?? "");
        } else if (result.message) {
            for (const f of fields) this._setValidity(f, "");
            const first = fields[0];
            if (first) this._setValidity(first, result.message);
        }

        this.dispatchEvent(new CustomEvent("validate-result", {
            bubbles: true,
            detail: result,
        }));
    }

    private _setValidity(el: ValueElement, msg: string) {
        const fn = (el as any).setCustomValidity;
        if (typeof fn === "function") fn.call(el, msg);
    }
}

if (!customElements.get("cms-validate")) {
    customElements.define("cms-validate", CmsValidate);
}
