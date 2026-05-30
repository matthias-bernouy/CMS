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

afterEach(() => {
    document.body.querySelectorAll("cms-endpoints-input").forEach(n => n.remove());
});

describe("<cms-endpoints-input>", () => {
    test("create mode: one empty row, method defaults to GET", () => {
        const el = mount();
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")).not.toBeNull();
        expect(byName(el, "endpoints.0.method")).not.toBeNull();
        expect(byName(el, "endpoints.0.targetUrl")).not.toBeNull();
        expect(byName(el, "endpoints.0.method")!.getAttribute("value")).toBe("GET");
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

    test("empty value → one empty row (create fallback)", () => {
        const el = mount("");
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")!.getAttribute("value")).toBeNull();
    });

    test("malformed value → one empty row, no throw during upgrade", () => {
        const el = mount("not json");
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")).not.toBeNull();
    });

    test("attribute-timing: value set BEFORE insert is seen at connect", () => {
        // mount() sets `value` before appendChild; assert the seed ran against the
        // final string (guards the render.ts interpolate-before-insert ordering).
        const el = mount(JSON.stringify([{ endpointId: "z", method: "PUT", targetUrl: "https://z.com" }]));
        expect(rows(el)).toHaveLength(1);
        expect(byName(el, "endpoints.0.endpointId")!.getAttribute("value")).toBe("z");
        expect(byName(el, "endpoints.0.method")!.getAttribute("value")).toBe("PUT");
    });
});
