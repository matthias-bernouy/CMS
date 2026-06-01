import { describe, test, expect, afterEach } from "bun:test";
import "cms-control/components/admin/EndpointsInput/EndpointsInput";

/** Mount a fresh `<cms-endpoints-input>` (optionally with a prefill `value`). */
function mount(value?: string): HTMLElement {
    const el = document.createElement("cms-endpoints-input");
    if (value !== undefined) el.setAttribute("value", value);   // set BEFORE insert (interpolate-before-insert contract)
    document.body.appendChild(el);
    return el;
}

const rows  = (el: HTMLElement) => el.querySelectorAll('[data-role="endpoint-row"]');
const byName = (el: HTMLElement, name: string) => el.querySelector(`[name="${name}"]`);
const clickAction = (el: HTMLElement, action: string, i = 0) =>
    (el.querySelectorAll(`[data-action="${action}"]`)[i] as HTMLElement)?.click();
/** Read the collapsed-header summary text for row `i`. This is a plain light-DOM
 *  `textContent` read (written by the component), not a p9r-tag shadow render —
 *  so it works even though blocs elements aren't upgraded under happy-dom. */
const header = (el: HTMLElement, i: number, key: string) =>
    rows(el)[i]!.querySelector(`[data-display="${key}"]`)?.textContent;

afterEach(() => {
    document.body.querySelectorAll("cms-endpoints-input").forEach(n => n.remove());
});

describe("<cms-endpoints-input>", () => {
    test("absent value attribute → one starter row, method defaults to GET", () => {
        const el = mount();
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")).not.toBeNull();
        expect(byName(el, "endpoints.0.method")).not.toBeNull();
        expect(byName(el, "endpoints.0.targetUrl")).not.toBeNull();
        expect(byName(el, "endpoints.0.method")!.getAttribute("value")).toBe("GET");
    });

    test("each endpoint is a p9r-accordion-item with a header summary", () => {
        const el = mount();
        const item = rows(el)[0]!;
        expect(item.tagName).toBe("P9R-ACCORDION-ITEM");
        // default header summary
        expect(header(el, 0, "method")).toBe("GET");
        expect(header(el, 0, "endpointId")).toBe("(new endpoint)");
        expect(header(el, 0, "targetUrl")).toBe("");
        // the three named controls live in the item body
        expect(item.querySelector('[name="endpoints.0.endpointId"]')).not.toBeNull();
    });

    test("body is a tabs shell — Infos active with the 3 fields; In/Out active; no Rules tab", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const tabs = item.querySelector("p9r-tabs");
        expect(tabs).not.toBeNull();
        expect(tabs!.getAttribute("active")).toBe("infos-0");
        // Infos panel holds the three named controls
        const infos = item.querySelector("#infos-0");
        expect(infos).not.toBeNull();
        expect(infos!.querySelector('[name="endpoints.0.endpointId"]')).not.toBeNull();
        expect(infos!.querySelector('[name="endpoints.0.method"]')).not.toBeNull();
        expect(infos!.querySelector('[name="endpoints.0.targetUrl"]')).not.toBeNull();
        // In/Out are active editors; the old deferred Rules tab is gone (Headers tab arrives in A2).
        expect(item.querySelector("#in-0")!.hasAttribute("disabled")).toBe(false);
        expect(item.querySelector("#out-0")!.hasAttribute("disabled")).toBe(false);
        expect(item.querySelector("#rules-0")).toBeNull();
    });

    test("In tab: query params — add / name / remove, synced into the params blob", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const paramRows = () => item.querySelectorAll('[data-role="query-param-row"]');
        const blob = () => (item.querySelector('[name="endpoints.0.params"]') as HTMLInputElement).value;
        const addBtn = item.querySelector('[data-role="add-query-param"]') as HTMLElement;
        expect(paramRows()).toHaveLength(0);
        expect(blob()).toBe("");

        addBtn.click();
        addBtn.click();
        expect(paramRows()).toHaveLength(2);
        expect(blob()).toBe("");   // empty-name rows aren't serialized

        // name the first row → it appears in the blob (happy-dom: readControl reads the attribute)
        const nameInput = paramRows()[0]!.querySelector('[data-role="param-name"]') as HTMLElement;
        nameInput.setAttribute("value", "limit");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        expect(JSON.parse(blob())).toEqual([{ name: "limit", in: "query", type: "string", required: false }]);

        // remove the (named) first row → blob empties again
        (paramRows()[0]!.querySelector("p9r-icon-button") as HTMLElement).click();
        expect(paramRows()).toHaveLength(1);
        expect(blob()).toBe("");
    });

    test("In tab: query params prefilled from the value JSON (rows + blob + required)", () => {
        const el = mount(JSON.stringify([
            { endpointId: "list", method: "GET", targetUrl: "https://x.com", params: [
                { name: "limit", in: "query", type: "number", required: true },
                { name: "q",     in: "query", type: "string", required: false },
            ] },
        ]));
        const item = rows(el)[0]!;
        const qrows = item.querySelectorAll('[data-role="query-param-row"]');
        expect(qrows).toHaveLength(2);
        expect(qrows[0]!.querySelector('[data-role="param-name"]')!.getAttribute("value")).toBe("limit");
        expect(qrows[0]!.querySelector('[data-role="param-type"]')!.getAttribute("value")).toBe("number");
        expect(qrows[0]!.querySelector('[data-role="required"]')!.hasAttribute("checked")).toBe(true);
        expect(qrows[1]!.querySelector('[data-role="required"]')!.hasAttribute("checked")).toBe(false);
        // the hidden blob is seeded from the params
        expect(JSON.parse((item.querySelector('[name="endpoints.0.params"]') as HTMLInputElement).value)).toEqual([
            { name: "limit", in: "query", type: "number", required: true },
            { name: "q",     in: "query", type: "string", required: false },
        ]);
    });

    test("In tab: path params auto-detected from the targetUrl (read-only, not serialized)", () => {
        const el = mount(JSON.stringify([
            { endpointId: "getItem", method: "GET", targetUrl: "https://api.x.com/{org}/items/{id}" },
        ]));
        const item = rows(el)[0]!;
        const pathRows = item.querySelectorAll('[data-role="path-param-row"]');
        expect(pathRows).toHaveLength(2);
        expect(Array.from(pathRows, r => (r as HTMLElement).dataset.paramName)).toEqual(["org", "id"]);
        // path params are derived server-side from the URL → no form fields emitted
        expect(item.querySelector('[data-role="path-params"] [name]')).toBeNull();
    });

    test("In tab: a URL with no {placeholders} → hint, zero path rows", () => {
        const el = mount(JSON.stringify([
            { endpointId: "list", method: "GET", targetUrl: "https://api.x.com/items" },
        ]));
        const item = rows(el)[0]!;
        expect(item.querySelectorAll('[data-role="path-param-row"]')).toHaveLength(0);
        expect(item.querySelector('[data-role="path-params"]')!.textContent).toContain("placeholders");
    });

    test("In tab: Body section starts empty with a '+ Define request body' affordance", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const body = item.querySelector('[data-role="body"]');
        expect(body).not.toBeNull();
        expect(body!.querySelector('[data-role="define-body"]')).not.toBeNull();
        // no shape tree yet, and the hidden body field is empty (no body stored)
        expect(body!.querySelector('[data-role="node-type"]')).toBeNull();
        expect((item.querySelector('[name="endpoints.0.body"]') as HTMLInputElement).value).toBe("");
    });

    test("In tab: a seeded body renders the tree (incl. required) and syncs the hidden JSON", () => {
        const body = {
            type: "object",
            properties: { id: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
            required: ["id"],
        };
        const el = mount(JSON.stringify([
            { endpointId: "create", method: "POST", targetUrl: "https://x.com/items", body },
        ]));
        const item = rows(el)[0]!;
        // root + the two property nodes + the array's items node = 4 type selects
        expect(item.querySelectorAll('[data-role="node-type"]').length).toBeGreaterThanOrEqual(4);
        // the "id" property's Required switch is on, "tags" is off
        const switches = item.querySelectorAll('[data-role="body"] [data-role="required"]');
        expect(switches[0]!.hasAttribute("checked")).toBe(true);
        expect(switches[1]!.hasAttribute("checked")).toBe(false);
        const hidden = item.querySelector('[name="endpoints.0.body"]') as HTMLInputElement;
        expect(JSON.parse(hidden.value)).toEqual(body);
    });

    test("Out tab: renders, '+ Add response' adds a row, remove removes it", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        expect(out.hasAttribute("disabled")).toBe(false);
        const respRows = () => out.querySelectorAll('[data-role="response-row"]');
        const addBtn = out.querySelector('[data-role="add-response"]') as HTMLElement;
        expect(addBtn).not.toBeNull();
        expect(respRows()).toHaveLength(0);

        addBtn.click();
        addBtn.click();
        expect(respRows()).toHaveLength(2);
        // remove the first response row
        (respRows()[0]!.querySelector("p9r-icon-button") as HTMLElement).click();
        expect(respRows()).toHaveLength(1);
    });

    test("Out tab: removing a FILLED response drops it from the serialised list, not just the DOM", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        const respRows = () => out.querySelectorAll('[data-role="response-row"]');
        const addBtn = out.querySelector('[data-role="add-response"]') as HTMLElement;
        const setStatus = (rowEl: Element, v: string) => {
            const s = rowEl.querySelector('[data-role="response-status"]') as HTMLElement;
            s.setAttribute("value", v);
            s.dispatchEvent(new Event("change", { bubbles: true }));
        };
        addBtn.click();
        addBtn.click();
        setStatus(respRows()[0]!, "200");
        setStatus(respRows()[1]!, "404");
        expect(JSON.parse(blob())).toEqual([{ status: "200" }, { status: "404" }]);
        // remove the first (200) row → the blob, not only the DOM, must drop it
        (respRows()[0]!.querySelector("p9r-icon-button") as HTMLElement).click();
        expect(respRows()).toHaveLength(1);
        expect(JSON.parse(blob())).toEqual([{ status: "404" }]);
    });

    test("Out tab: a status with no body serialises to [{status}] (204-style, no body key)", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        const statusInput = out.querySelector('[data-role="response-status"]') as HTMLElement;
        statusInput.setAttribute("value", "204");
        statusInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(JSON.parse(blob())).toEqual([{ status: "204" }]);
    });

    test("Out tab: defining a body on a response serialises [{status, body}]", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        const row = out.querySelector('[data-role="response-row"]') as HTMLElement;
        const statusInput = row.querySelector('[data-role="response-status"]') as HTMLElement;
        statusInput.setAttribute("value", "200");
        statusInput.dispatchEvent(new Event("change", { bubbles: true }));
        // define a body → empty object shape
        (row.querySelector('[data-role="define-body"]') as HTMLElement).click();
        expect(JSON.parse(blob())).toEqual([{ status: "200", body: { type: "object" } }]);
    });

    test("Out tab: selecting a common code serialises [{status}]", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        const sel = out.querySelector('[data-role="response-status"]') as HTMLElement;
        sel.setAttribute("value", "201");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        expect(JSON.parse(blob())).toEqual([{ status: "201" }]);
    });

    test("Out tab: choosing 'Custom…' reveals the custom input; typing 418 → [{status:'418'}]", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        const row = out.querySelector('[data-role="response-row"]') as HTMLElement;
        const sel = row.querySelector('[data-role="response-status"]') as HTMLElement;
        const custom = row.querySelector('[data-role="response-status-custom"]') as HTMLElement;
        expect(custom.style.display).toBe("none");   // hidden until custom mode
        sel.setAttribute("value", "custom");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        expect(custom.style.display).toBe("");        // revealed
        custom.setAttribute("value", "418");
        custom.dispatchEvent(new Event("input", { bubbles: true }));
        expect(JSON.parse(blob())).toEqual([{ status: "418" }]);
    });

    test("Out tab: a custom value 700 flags invalid + hint-level=error on the custom input", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        const row = out.querySelector('[data-role="response-row"]') as HTMLElement;
        const sel = row.querySelector('[data-role="response-status"]') as HTMLElement;
        const custom = row.querySelector('[data-role="response-status-custom"]') as HTMLElement;
        sel.setAttribute("value", "custom");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        custom.setAttribute("value", "700");
        custom.dispatchEvent(new Event("input", { bubbles: true }));
        expect(custom.hasAttribute("invalid")).toBe(true);
        expect(custom.getAttribute("hint-level")).toBe("error");

        // leaving custom mode (pick a real code) clears the stale error on the hidden input
        sel.setAttribute("value", "404");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        expect(custom.hasAttribute("invalid")).toBe(false);
        expect(custom.hasAttribute("hint-level")).toBe(false);
    });

    test("Out tab: a seeded custom code (418) renders in custom mode with the input pre-filled", () => {
        const el = mount(JSON.stringify([
            { endpointId: "x", method: "GET", targetUrl: "https://x.com", output: [{ status: "418" }] },
        ]));
        const item = rows(el)[0]!;
        const row = item.querySelector('[data-role="response-row"]') as HTMLElement;
        const sel = row.querySelector('[data-role="response-status"]') as HTMLElement;
        const custom = row.querySelector('[data-role="response-status-custom"]') as HTMLElement;
        expect(sel.getAttribute("value")).toBe("custom");
        expect(custom.style.display).toBe("");
        expect(custom.getAttribute("value")).toBe("418");
        const hidden = item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement;
        expect(JSON.parse(hidden.value)).toEqual([{ status: "418" }]);
    });

    test("Out tab: a seeded common code (404) shows the select, custom input hidden", () => {
        const el = mount(JSON.stringify([
            { endpointId: "x", method: "GET", targetUrl: "https://x.com", output: [{ status: "404" }] },
        ]));
        const item = rows(el)[0]!;
        const row = item.querySelector('[data-role="response-row"]') as HTMLElement;
        const sel = row.querySelector('[data-role="response-status"]') as HTMLElement;
        const custom = row.querySelector('[data-role="response-status-custom"]') as HTMLElement;
        expect(sel.getAttribute("value")).toBe("404");
        expect(custom.style.display).toBe("none");
    });

    test("Out tab: a seeded output renders both rows and the hidden field equals the seed verbatim", () => {
        const output = [
            { status: "200", body: { type: "object", properties: { ok: { type: "boolean" } } } },
            { status: "404" },
        ];
        const el = mount(JSON.stringify([
            { endpointId: "list", method: "GET", targetUrl: "https://x.com", output },
        ]));
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        expect(out.querySelectorAll('[data-role="response-row"]')).toHaveLength(2);
        const hidden = item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement;
        expect(JSON.parse(hidden.value)).toEqual(output);
        expect(hidden.getAttribute("type")).toBe("hidden");
    });

    test("Out tab: a blank-status row is skipped (read returns null)", () => {
        const el = mount();
        const item = rows(el)[0]!;
        const out = item.querySelector("#out-0")!;
        const blob = () => (item.querySelector('[name="endpoints.0.output"]') as HTMLInputElement).value;
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        (out.querySelector('[data-role="add-response"]') as HTMLElement).click();
        expect(out.querySelectorAll('[data-role="response-row"]')).toHaveLength(2);
        expect(blob()).toBe("");   // both blank → no output stored
    });

    test("Out tab: exactly one endpoints.<i>.output field exists (passthrough removed)", () => {
        const el = mount(JSON.stringify([
            { endpointId: "list", method: "GET", targetUrl: "https://x.com", output: [{ status: "200" }] },
        ]));
        const item = rows(el)[0]!;
        expect(item.querySelectorAll('[name="endpoints.0.output"]')).toHaveLength(1);
        // the old In-tab passthrough role is gone
        expect(item.querySelector('[data-role="output-passthrough"]')).toBeNull();
    });

    test("In tab: changing an array's element type re-syncs the body JSON", () => {
        const body = { type: "object", properties: { tags: { type: "array", items: { type: "string" } } } };
        const el = mount(JSON.stringify([{ endpointId: "x", method: "POST", targetUrl: "https://x.com", body }]));
        const item = rows(el)[0]!;
        const tagsRow = Array.from(item.querySelectorAll('.ep-prop-row'))
            .find(r => (r.querySelector('.ep-prop-name') as Element | null)?.getAttribute('value') === 'tags')!;
        const elemSel = tagsRow.querySelectorAll('[data-role="node-type"]')[1] as HTMLElement;
        // happy-dom: p9r-select isn't upgraded, so readControl falls back to the attribute.
        elemSel.setAttribute('value', 'number');
        elemSel.dispatchEvent(new Event('change', { bubbles: true }));
        const hidden = item.querySelector('[name="endpoints.0.body"]') as HTMLInputElement;
        expect(JSON.parse(hidden.value).properties.tags.items).toEqual({ type: "number" });
    });

    test("In tab: a seeded query-param description round-trips in the params blob", () => {
        const el = mount(JSON.stringify([
            { endpointId: "search", method: "GET", targetUrl: "https://x.com", params: [
                { name: "q", in: "query", type: "string", required: false, description: "Search terms" },
            ] },
        ]));
        const item = rows(el)[0]!;
        const blob = JSON.parse((item.querySelector('[name="endpoints.0.params"]') as HTMLInputElement).value);
        expect(blob[0].description).toBe("Search terms");
    });

    test("In tab: a seeded endpoint meta round-trips via the hidden passthrough", () => {
        const meta = { name: "Search", icon: "search" };
        const el = mount(JSON.stringify([
            { endpointId: "search", method: "GET", targetUrl: "https://x.com", meta },
        ]));
        const item = rows(el)[0]!;
        const hidden = item.querySelector('[name="endpoints.0.meta"]') as HTMLInputElement;
        expect(JSON.parse(hidden.value)).toEqual(meta);
        expect(hidden.dataset.role).toBe("meta-passthrough");
    });

    test("In tab: seeded headers round-trip verbatim via the hidden headers passthrough (no Headers tab yet)", () => {
        const headers = [
            { name: "X-Api-Version", source: { from: "static", value: "2024-01" } },
            { name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } },
        ];
        const el = mount(JSON.stringify([
            { endpointId: "search", method: "GET", targetUrl: "https://x.com", headers },
        ]));
        const item = rows(el)[0]!;
        const hidden = item.querySelector('[data-role="headers-passthrough"]') as HTMLInputElement;
        expect(hidden.getAttribute("name")).toBe("endpoints.0.headers");
        expect(JSON.parse(hidden.value)).toEqual(headers);
        // A1 ships no Headers tab.
        expect(item.querySelector("#headers-0")).toBeNull();
    });

    test("delete is a header-actions button carrying data-action=remove-endpoint", () => {
        const el = mount();
        const btn = rows(el)[0]!.querySelector('[data-action="remove-endpoint"]');
        expect(btn).not.toBeNull();
        expect(btn!.getAttribute("slot")).toBe("header-actions");
    });

    test("add: clicking + Add appends an indexed row", () => {
        const el = mount();
        clickAction(el, "add-endpoint");
        expect(rows(el)).toHaveLength(2);
        expect(byName(el, "endpoints.0.targetUrl")).not.toBeNull();
        expect(byName(el, "endpoints.1.targetUrl")).not.toBeNull();
    });

    test("remove leaves a gap (no re-index) — parser compacts it", () => {
        const el = mount();
        clickAction(el, "add-endpoint");          // now rows 0 and 1
        clickAction(el, "remove-endpoint", 0);    // remove row 0
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.targetUrl")).toBeNull();      // gap left
        expect(byName(el, "endpoints.1.targetUrl")).not.toBeNull();  // row 1 retained, NOT renumbered
    });

    test("JSON value → one prefilled row per element, with values", () => {
        const el = mount(JSON.stringify([
            { endpointId: "a", method: "POST", targetUrl: "https://x.com" },
            { endpointId: "b", method: "GET",  targetUrl: "https://y.com" },
        ]));
        expect(rows(el)).toHaveLength(2);
        expect(byName(el, "endpoints.0.endpointId")!.getAttribute("value")).toBe("a");
        expect(byName(el, "endpoints.0.method")!.getAttribute("value")).toBe("POST");
        expect(byName(el, "endpoints.0.targetUrl")!.getAttribute("value")).toBe("https://x.com");
        expect(byName(el, "endpoints.1.endpointId")!.getAttribute("value")).toBe("b");
        // header summary seeded from the (coerced) values
        expect(header(el, 0, "endpointId")).toBe("a");
        expect(header(el, 0, "method")).toBe("POST");
        expect(header(el, 0, "targetUrl")).toBe("https://x.com");
        expect(header(el, 1, "endpointId")).toBe("b");
    });

    test("seed then Add continues the index (no collision)", () => {
        const el = mount(JSON.stringify([
            { endpointId: "a", method: "GET", targetUrl: "https://x.com" },
            { endpointId: "b", method: "GET", targetUrl: "https://y.com" },
        ]));
        clickAction(el, "add-endpoint");
        expect(rows(el)).toHaveLength(3);
        expect(byName(el, "endpoints.2.endpointId")).not.toBeNull();   // continues at index 2
    });

    test("present-but-empty value ([]) → zero rows (provider has no endpoints yet)", () => {
        const el = mount("[]");
        expect(rows(el)).toHaveLength(0);
        // the "Add endpoint" affordance is still there to add the first one
        expect(el.querySelector('[data-action="add-endpoint"]')).not.toBeNull();
    });

    test("empty-string value → zero rows", () => {
        expect(rows(mount(""))).toHaveLength(0);
    });

    test("malformed value → zero rows, no throw during upgrade", () => {
        expect(rows(mount("not json"))).toHaveLength(0);
    });

    test("attribute-timing: value set BEFORE insert is seen at connect", () => {
        // mount() sets `value` before appendChild; assert the seed ran against the
        // final string (guards the render.ts interpolate-before-insert ordering).
        const el = mount(JSON.stringify([{ endpointId: "z", method: "PUT", targetUrl: "https://z.com" }]));
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")!.getAttribute("value")).toBe("z");
        expect(byName(el, "endpoints.0.method")!.getAttribute("value")).toBe("PUT");
        expect(header(el, 0, "endpointId")).toBe("z");
        expect(header(el, 0, "method")).toBe("PUT");
    });
});
