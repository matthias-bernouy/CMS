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

describe("ParamSync — conflict & dedupe correctness", () => {
    test("a param change mid-debounce does not clobber the in-flight local edit", async () => {
        spyReplaceState();
        const el = input({ "cms-param-sync": "search" });
        const ps = new ParamSync(el);
        ps.start();

        el.value = "hello";
        el.dispatchEvent(new Event("input")); // debounce armed

        // an external param change arrives before the debounce elapses
        location.href = "http://localhost/?search=external";
        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
        expect(el.value).toBe("hello"); // NOT clobbered by reflect

        await waitFor(() => writtenUrls.length > 0);
        expect(writtenUrls.at(-1)).toContain("search=hello"); // user's edit wins and writes
        ps.dispose();
    });

    test("re-picking a value a no-op reflect couldn't apply still writes", () => {
        // `last` must track the control's ACTUAL value, not the intended one:
        // a <select> rejects value="X" until the option exists, so recording "X"
        // would wrongly dedupe a later genuine pick of "X".
        spyReplaceState();
        location.href = "http://localhost/admin/pages?tag=X";
        const sel = document.createElement("select");
        sel.setAttribute("cms-param-sync", "tag");
        document.body.appendChild(sel);
        const ps = new ParamSync(sel);
        ps.start();
        expect(sel.value).toBe(""); // no-op set; last must be "" not "X"

        const o = document.createElement("option");
        o.value = "X";
        o.textContent = "X";
        sel.appendChild(o);
        sel.value = "X";
        sel.dispatchEvent(new Event("change"));

        expect(writtenUrls.at(-1)).toContain("tag=X"); // not dedupe-dropped
        ps.dispose();
    });
});
