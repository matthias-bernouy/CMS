import { describe, test, expect, afterEach } from "bun:test";
import {
    currentParams, currentState, hasParamTokens, hasStateTokens,
    PARAMS_CHANGE_EVENT, resolveParams, resolveState,
    setParam, setState, STATE_CHANGE_EVENT,
} from "../../../src/binding/params";

// happy-dom does not reflect history.replaceState into `location`, but DOES
// honour `location.href = …`. Use href to set up state; reset it between tests.
afterEach(() => { location.href = "http://localhost/"; });

describe("hasParamTokens", () => {
    test("detects #{...}", () => {
        expect(hasParamTokens("/api/x?q=#{search}")).toBe(true);
        expect(hasParamTokens("/api/x?q=#{ search }")).toBe(true);
        expect(hasParamTokens("/api/x?q=literal")).toBe(false);
        expect(hasParamTokens("/api/x?q={{ data }}")).toBe(false); // data token, not a param
    });

    test("matches exactly what resolveParams substitutes (no false reactivity)", () => {
        // malformed / unclosed tokens are left literal by resolveParams, so they
        // must NOT mark the source reactive.
        expect(hasParamTokens("/api/x?q=#{a-b}")).toBe(false);
        expect(hasParamTokens("/api/x#{notclosed")).toBe(false);
        expect(hasParamTokens("/api/x?q=#{}")).toBe(false);
    });
});

describe("resolveParams", () => {
    const p = (qs: string) => new URLSearchParams(qs);

    test("replaces #{name} with the param value", () => {
        expect(resolveParams("/api/x?q=#{search}", p("search=hello"))).toBe("/api/x?q=hello");
    });

    test("missing param → empty string", () => {
        expect(resolveParams("/api/x?q=#{search}", p(""))).toBe("/api/x?q=");
    });

    test("URL-encodes the value", () => {
        expect(resolveParams("/api/x?q=#{search}", p("search=a b&c"))).toBe("/api/x?q=a%20b");
    });

    test("multiple tokens", () => {
        expect(resolveParams("/x?s=#{search}&t=#{tag}", p("search=a&tag=b"))).toBe("/x?s=a&t=b");
    });

    test("leaves {{ data }} tokens untouched", () => {
        expect(resolveParams("/x?id=#{p}&n={{ name }}", p("p=1"))).toBe("/x?id=1&n={{ name }}");
    });
});

describe("local page state", () => {
    test("detects and resolves @{...} tokens", () => {
        setState("address", "12 rue A", document);
        setState("delivery.address", "Paris", document);
        expect(hasStateTokens("/api/x?q=@{address}")).toBe(true);
        expect(hasStateTokens("/api/x?q=@{delivery.address}")).toBe(true);
        expect(hasStateTokens("/api/x?q=#{address}")).toBe(false);
        expect(resolveState("/api/x?q=@{address}", document)).toBe("/api/x?q=12%20rue%20A");
        expect(resolveState("/api/x?q=@{delivery.address}", document)).toBe("/api/x?q=Paris");
    });

    test("setState writes local state without changing the address bar", () => {
        let fired = 0;
        const onChange = () => { fired++; };
        document.addEventListener(STATE_CHANGE_EVENT, onChange);
        location.href = "http://localhost/admin/pages?search=old";

        setState("deliveryAddress", "Paris", document);

        expect(currentState("deliveryAddress", document)).toBe("Paris");
        expect(location.search).toBe("?search=old");
        expect(fired).toBe(1);
        document.removeEventListener(STATE_CHANGE_EVENT, onChange);
    });
});

describe("setParam (via replaceState — asserted through a spy, since happy-dom doesn't reflect it)", () => {
    test("calls replaceState with the new param and fires the change event", () => {
        const urls: string[] = [];
        const orig = history.replaceState;
        history.replaceState = ((_s: unknown, _t: unknown, url: string) => urls.push(url)) as typeof history.replaceState;
        let fired = 0;
        const onChange = () => { fired++; };
        document.addEventListener(PARAMS_CHANGE_EVENT, onChange);

        location.href = "http://localhost/admin/pages";
        setParam("search", "hello");

        expect(urls.at(-1)).toContain("search=hello");
        expect(fired).toBe(1);

        history.replaceState = orig;
        document.removeEventListener(PARAMS_CHANGE_EVENT, onChange);
    });

    test("empty value removes the param from the written URL", () => {
        const urls: string[] = [];
        const orig = history.replaceState;
        history.replaceState = ((_s: unknown, _t: unknown, url: string) => urls.push(url)) as typeof history.replaceState;

        location.href = "http://localhost/admin/pages?tag=news";
        setParam("tag", "");

        expect(urls.at(-1)).not.toContain("tag");

        history.replaceState = orig;
    });

    test("currentParams reads the address bar", () => {
        location.href = "http://localhost/admin/pages?a=1&b=2";
        expect(currentParams().get("a")).toBe("1");
        expect(currentParams().get("b")).toBe("2");
    });
});
