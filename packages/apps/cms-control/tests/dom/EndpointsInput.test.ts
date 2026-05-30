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

    test("body is a tabs shell — Infos active with the 3 fields, In/Out/Rules deferred", () => {
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
        // deferred tabs present and disabled
        for (const id of ["in-0", "out-0", "rules-0"]) {
            const panel = item.querySelector(`#${id}`);
            expect(panel).not.toBeNull();
            expect(panel!.hasAttribute("disabled")).toBe(true);
        }
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
