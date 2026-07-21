import { route, type FunctionDetail } from "./api";
import { stringify } from "./draft";

export function styleNode(css: string): HTMLStyleElement {
    const el = document.createElement("style");
    el.textContent = css;
    return el;
}

export function state(message: string): HTMLElement {
    return div("state", message);
}

export function backLink(): HTMLAnchorElement {
    const back = document.createElement("a");
    back.slot = "back";
    back.href = route("/admin/functions");
    back.textContent = "<";
    back.title = "Back to functions";
    back.setAttribute("aria-label", "Back to functions");
    return back;
}

export function title(detail: FunctionDetail): HTMLElement {
    const wrap = document.createElement("span");
    wrap.slot = "title";
    wrap.textContent = detail.label;
    return wrap;
}

export function detailSection(slot: "main" | "aside", heading: string): HTMLElement {
    const section = document.createElement("cms-detail-section");
    section.slot = slot;
    section.setAttribute("heading", heading);
    return section;
}

export function fieldWrap(titleText: string, control: HTMLElement, hint?: HTMLElement): HTMLElement {
    const wrap = div("field", label(titleText), control);
    if (hint) {
        wrap.append(hint);
    }
    return wrap;
}

export function schemaBlock(titleText: string, value: unknown): HTMLElement {
    return div("schema-block", label(titleText), pre(value === null ? "None" : stringify(value)));
}

export function keyValues(rows: Array<[string, string]>): HTMLElement {
    const list = document.createElement("dl");
    list.className = "kv";
    for (const [key, value] of rows) {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = key;
        dd.textContent = value;
        list.append(dt, dd);
    }
    return list;
}

export function label(text: string): HTMLLabelElement {
    const el = document.createElement("label");
    el.textContent = text;
    return el;
}

export function helper(text: string): HTMLElement {
    return div("helper", text);
}

export function textarea(role: string, value: string): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    el.dataset.role = role;
    el.spellcheck = false;
    el.value = value;
    return el;
}

export function button(text: string, tone: "primary" | "secondary"): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `button ${tone}`;
    el.textContent = text;
    return el;
}

export function option(value: string, text: string): HTMLOptionElement {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = text;
    return el;
}

export function pre(text: string): HTMLPreElement {
    const el = document.createElement("pre");
    el.textContent = text;
    return el;
}

export function div(className: string, ...children: (Node | string)[]): HTMLElement {
    const el = document.createElement("div");
    el.className = className;
    for (const child of children) {
        el.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return el;
}
