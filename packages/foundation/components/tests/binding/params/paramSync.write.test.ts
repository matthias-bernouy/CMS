import { describe, test, expect, afterEach } from "bun:test";
import { ParamSync } from "../../../src/binding/params/ParamSync";
import { PARAMS_CHANGE_EVENT } from "../../../src/binding/params";

let writtenUrls: string[] = [];
const realReplace = history.replaceState.bind(history);
afterEach(() => {
    history.replaceState = realReplace;
    location.href = "http://localhost/";
    document.body.replaceChildren();
    writtenUrls = [];
});
function spyReplaceState() {
    history.replaceState = ((_s: unknown, _t: unknown, url: string) =>
        writtenUrls.push(url)) as typeof history.replaceState;
}
function input(attrs: Record<string, string>): HTMLInputElement {
    const el = document.createElement("input");
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}
async function waitFor(p: () => boolean, tries = 40) {
    for (let i = 0; i < tries; i++) {
        if (p()) {
            return;
        }
        await new Promise((r) => setTimeout(r, 20));
    }
}

describe("ParamSync — key resolution", () => {
    test("uses the attribute value as the key", () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "x";
        el.dispatchEvent(new Event("change"));
        expect(writtenUrls.at(-1)).toContain("search=x");
        ps.dispose();
    });

    test("falls back to the control's name", () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "", name: "visible" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "draft";
        el.dispatchEvent(new Event("change"));
        expect(writtenUrls.at(-1)).toContain("visible=draft");
        ps.dispose();
    });
});

describe("ParamSync — value → param", () => {
    test("change writes immediately", () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "tag" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "news";
        el.dispatchEvent(new Event("change"));
        expect(writtenUrls.at(-1)).toContain("tag=news");
        ps.dispose();
    });

    test("input is debounced (fires once after the pause)", async () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "a";
        el.dispatchEvent(new Event("input"));
        el.value = "ab";
        el.dispatchEvent(new Event("input"));
        el.value = "abc";
        el.dispatchEvent(new Event("input"));
        expect(writtenUrls.length).toBe(0); // nothing yet
        await waitFor(() => writtenUrls.length > 0);
        expect(writtenUrls.length).toBe(1);
        expect(writtenUrls.at(-1)).toContain("search=abc");
        ps.dispose();
    });

    test("fires the change event so #{}-sources reload", () => {
        let fired = 0;
        const onChange = () => {
            fired++;
        };
        document.addEventListener(PARAMS_CHANGE_EVENT, onChange);
        const el = input({ "cms-param-sync": "tag" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "x";
        el.dispatchEvent(new Event("change"));
        expect(fired).toBe(1);
        document.removeEventListener(PARAMS_CHANGE_EVENT, onChange);
        ps.dispose();
    });

    test("no write when the value is unchanged (dedupe)", () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "tag" });
        const ps = new ParamSync(el);
        ps.start();
        el.value = "same";
        el.dispatchEvent(new Event("change"));
        el.dispatchEvent(new Event("change")); // same value again
        expect(writtenUrls.length).toBe(1);
        ps.dispose();
    });
});
