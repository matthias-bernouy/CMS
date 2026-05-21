// Pure field helpers for <hub-config-form>: pick a widget per JSON-Schema
// property, build the matching <p9r-*> input, and read its value back.

export type Prop = Record<string, any>;

export function pickWidget(prop: Prop): string {
    const explicit = prop["x-widget"];
    if (typeof explicit === "string") return explicit;
    if (prop.writeOnly) return "password";
    if (prop.type === "boolean") return "toggle";
    if (prop.type === "integer" || prop.type === "number") return "number";
    if (prop.type === "string" && Array.isArray(prop.enum)) return "select";
    if (prop.type === "string" && prop.format === "date") return "date";
    if (prop.type === "string") return "text";
    if (prop.type === "array" && prop.items && Array.isArray(prop.items.enum)) return "select-multiple";
    if (prop.type === "array") return "tags";
    return "text";
}

export function fieldEditable(prop: Prop, schema: Prop, mode: string): boolean {
    const xwb = prop["x-writable-by"];
    const root = Array.isArray(schema.defaultWritableBy) ? schema.defaultWritableBy : ["control-plane", "tenant"];
    const allowed = Array.isArray(xwb) ? xwb : root;
    return allowed.includes(mode);
}

export function makeInput(name: string, prop: Prop, value: any, widget: string, editable: boolean): HTMLElement {
    let el: HTMLElement;
    const sv = value === undefined || value === null ? "" : String(value);
    switch (widget) {
        case "toggle":
            el = document.createElement("p9r-switch");
            el.setAttribute("name", name);
            if (value === true || value === "true") el.setAttribute("checked", "");
            break;
        case "select":
            el = document.createElement("p9r-select");
            el.setAttribute("name", name);
            for (const opt of prop.enum) {
                const o = document.createElement("option");
                o.value = String(opt); o.textContent = String(opt);
                if (String(opt) === sv) o.selected = true;
                el.appendChild(o);
            }
            break;
        case "select-multiple": {
            el = document.createElement("select");
            el.setAttribute("multiple", ""); el.setAttribute("name", name);
            const values = Array.isArray(value) ? value : [];
            for (const opt of prop.items.enum) {
                const o = document.createElement("option");
                o.value = String(opt); o.textContent = String(opt);
                if (values.includes(opt)) o.selected = true;
                el.appendChild(o);
            }
            break;
        }
        case "number":
        case "slider":
            el = document.createElement("p9r-input");
            el.setAttribute("type", "number"); el.setAttribute("name", name); el.setAttribute("value", sv);
            if (prop.minimum !== undefined) el.setAttribute("min", String(prop.minimum));
            if (prop.maximum !== undefined) el.setAttribute("max", String(prop.maximum));
            break;
        case "password":
            el = document.createElement("p9r-input");
            el.setAttribute("type", "password"); el.setAttribute("name", name);
            if (!prop.writeOnly) el.setAttribute("value", sv);
            break;
        case "date":
            el = document.createElement("p9r-input");
            el.setAttribute("type", "date"); el.setAttribute("name", name); el.setAttribute("value", sv);
            break;
        case "textarea":
            el = document.createElement("textarea");
            el.setAttribute("name", name); (el as HTMLTextAreaElement).value = sv;
            break;
        case "tags":
            el = document.createElement("p9r-input");
            el.setAttribute("type", "text"); el.setAttribute("name", name);
            el.setAttribute("placeholder", "comma-separated values");
            el.setAttribute("value", Array.isArray(value) ? value.join(", ") : sv);
            (el as HTMLElement).dataset.tags = "1";
            break;
        default:
            el = document.createElement("p9r-input");
            el.setAttribute("type", "text"); el.setAttribute("name", name); el.setAttribute("value", sv);
    }
    if (!editable) el.setAttribute("disabled", "");
    if (prop.title) el.setAttribute("label", prop.title);
    if (prop.description) el.setAttribute("hint", prop.description);
    return el;
}

export function readValue(el: any, prop: Prop, widget: string): any {
    if (widget === "toggle") return Boolean(el.hasAttribute("checked") || el.checked);
    if (widget === "select-multiple") {
        const out: string[] = [];
        for (const o of el.options) if (o.selected) out.push(o.value);
        return out;
    }
    if (widget === "tags") {
        const raw = (el.value || el.getAttribute("value") || "").trim();
        return raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    }
    if (widget === "number" || widget === "slider") {
        const raw = el.value !== undefined ? el.value : el.getAttribute("value");
        if (raw === "" || raw === null || raw === undefined) return undefined;
        const n = Number(raw);
        return prop.type === "integer" ? Math.trunc(n) : n;
    }
    if (widget === "password" && prop.writeOnly) {
        const raw = el.value !== undefined ? el.value : el.getAttribute("value");
        return raw ? raw : undefined;
    }
    const raw = el.value !== undefined ? el.value : el.getAttribute("value");
    return raw === "" || raw === null || raw === undefined ? undefined : raw;
}
