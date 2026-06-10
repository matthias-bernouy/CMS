import { describe, test, expect, afterEach } from "bun:test";
import { ParamSync } from "../src/binding/paramSync";
import { PARAMS_CHANGE_EVENT } from "../src/binding/params";

// happy-dom honours location.href (not replaceState). Spy replaceState to read
// the URL setParam would write; reset href between tests.
let writtenUrls: string[] = [];
const realReplace = history.replaceState.bind(history);
afterEach(() => {
    history.replaceState = realReplace;
    location.href = "http://localhost/";
    document.body.replaceChildren();
    writtenUrls = [];
});
function spyReplaceState() {
    history.replaceState = ((_s: unknown, _t: unknown, url: string) => writtenUrls.push(url)) as typeof history.replaceState;
}
async function waitFor(p: () => boolean, tries = 40) {
    for (let i = 0; i < tries; i++) { if (p()) return; await new Promise((r) => setTimeout(r, 20)); }
}

function input(attrs: Record<string, string>): HTMLInputElement {
    const el = document.createElement("input");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
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
        el.value = "a"; el.dispatchEvent(new Event("input"));
        el.value = "ab"; el.dispatchEvent(new Event("input"));
        el.value = "abc"; el.dispatchEvent(new Event("input"));
        expect(writtenUrls.length).toBe(0); // nothing yet
        await waitFor(() => writtenUrls.length > 0);
        expect(writtenUrls.length).toBe(1);
        expect(writtenUrls.at(-1)).toContain("search=abc");
        ps.dispose();
    });

    test("fires the change event so #{}-sources reload", () => {
        let fired = 0;
        const onChange = () => { fired++; };
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
        o.value = "X"; o.textContent = "X";
        sel.appendChild(o);
        sel.value = "X";
        sel.dispatchEvent(new Event("change"));

        expect(writtenUrls.at(-1)).toContain("tag=X"); // not dedupe-dropped
        ps.dispose();
    });
});
