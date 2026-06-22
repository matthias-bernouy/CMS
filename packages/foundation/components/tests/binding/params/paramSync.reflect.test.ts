import { describe, test, expect, afterEach } from "bun:test";
import { ParamSync } from "../../../src/binding/params/ParamSync";
import { PARAMS_CHANGE_EVENT } from "../../../src/binding/params";

let writtenUrls: string[] = [];
const realReplace = history.replaceState.bind(history);
afterEach(() => { history.replaceState = realReplace; location.href = "http://localhost/"; document.body.replaceChildren(); writtenUrls = []; });
function spyReplaceState() { history.replaceState = ((_s: unknown, _t: unknown, url: string) => writtenUrls.push(url)) as typeof history.replaceState; }
function input(attrs: Record<string, string>): HTMLInputElement { const el = document.createElement("input"); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); document.body.appendChild(el); return el; }
async function waitFor(p: () => boolean, tries = 40) { for (let i = 0; i < tries; i++) { if (p()) return; await new Promise((r) => setTimeout(r, 20)); } }

describe("ParamSync — seed from param on start", () => {
    test("populates the control from an existing param", () => {
        location.href = "http://localhost/admin/pages?search=hello";
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();
        expect(el.value).toBe("hello");
        ps.dispose();
    });
});

describe("ParamSync — param → value (two-way)", () => {
    test("reflects a param change into the control", async () => {
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();
        expect(el.value).toBe("");

        location.href = "http://localhost/?search=world";
        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
        await waitFor(() => el.value === "world");
        expect(el.value).toBe("world");
        ps.dispose();
    });

    test("reflecting does NOT echo back as a write", () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();

        location.href = "http://localhost/?search=x";
        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT)); // → reflect, sets value
        expect(writtenUrls.length).toBe(0); // no setParam triggered
        ps.dispose();
    });

    test("re-applies the value when async options arrive (the <select> seed fix)", async () => {
        location.href = "http://localhost/admin/pages?tag=Histoire";
        const sel = document.createElement("select");
        sel.setAttribute("cms-param-sync", "tag");
        document.body.appendChild(sel);
        const ps = new ParamSync(sel);
        ps.start();
        expect(sel.value).toBe(""); // no matching option yet

        // a source populates the options later
        const o = document.createElement("option");
        o.value = "Histoire"; o.textContent = "Histoire";
        sel.appendChild(o);

        await waitFor(() => sel.value === "Histoire");
        expect(sel.value).toBe("Histoire");
        ps.dispose();
    });
});
