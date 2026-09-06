import { describe, expect, test } from "bun:test";
import { inspectNetwork } from "../index";
import type { UiSource } from "../../contracts/types";

const inspect = (content: string, overrides: Partial<UiSource> = {}) =>
    inspectNetwork({
        path: "packages/surfaces/cms-control/src/components/example/data.ts",
        content,
        kind: "script",
        browser: true,
        ...overrides,
    });

describe("browser network contracts", () => {
    test("reports native fetch calls, explicit browser globals and source positions", () => {
        const findings = inspect(
            '\n  fetch("/items");\nwindow.fetch("/items"); globalThis["fetch"]("/items"); self.fetch("/items");',
        );
        expect(findings).toHaveLength(4);
        expect(findings[0]).toMatchObject({
            rule: "ui.network.http",
            severity: "WARNING",
            line: 2,
            column: 3,
            evidence: 'fetch("/items")',
        });
        expect(findings[0]?.recommendation).toContain("binding");
    });

    test("ignores SSR, comments, strings and ordinary local methods", () => {
        expect(inspect('fetch("/server")', { browser: false })).toEqual([]);
        expect(
            inspect('// fetch("/example")\nconst sample = `new XMLHttpRequest(); fetch("/example")`; client.fetch();'),
        ).toEqual([]);
        expect(
            inspect("const fetch = () => 42; fetch(); function run(window: {fetch: Function}) { window.fetch(); }"),
        ).toEqual([]);
        expect(inspect("fetch(); function fetch() {}")).toEqual([]);
        expect(inspect("function run(globalThis: any, self: any) { globalThis.fetch(); self.fetch(); }")).toEqual([]);
        expect(inspect("try {} catch(fetch) { fetch(); }")).toEqual([]);
        expect(inspect("import fetch from './mock'; fetch('/local');")).toEqual([]);
    });

    test("resolves stable aliases, global aliases, destructuring and bound fetch", () => {
        const findings = inspect(`
            const transport = globalThis;
            const { fetch: request, XMLHttpRequest: Xhr } = transport;
            const send = request;
            let stable = fetch;
            const bound = window.fetch.bind(window);
            send('/one'); stable('/two'); bound('/three'); new Xhr();
        `);
        expect(findings).toHaveLength(4);
        expect(findings.every((finding) => finding.severity === "WARNING")).toBe(true);
    });

    test("respects nested lexical shadowing and invalidated aliases", () => {
        const findings = inspect(`
            const request = fetch;
            function local(request: Function, fetch: Function) { request(); fetch(); }
            { const request = () => {}; request(); }
            request('/real');
            let changed = fetch; changed = local; changed();
            const cyclic = other; const other = cyclic; cyclic();
        `);
        expect(findings).toHaveLength(1);
        expect(findings[0]?.evidence).toBe("request('/real')");
    });

    test("reports actual imported HTTP client requests without flagging imports or client creation", () => {
        const findings = inspect(`
            import http from 'axios'; import ky from 'ky';
            import { ofetch as load } from 'ofetch'; import * as transport from 'undici';
            const api = http.create({baseURL:'/api'});
            api.get('/one'); http.post('/two'); ky('/three'); load('/four'); transport.request('/five');
        `);
        expect(findings).toHaveLength(5);
        expect(inspect("import axios from 'axios'; const api = axios.create({});")).toEqual([]);
        expect(inspect("import axios from './axios'; axios.get('/local');")).toEqual([]);
        expect(inspect("import axios from 'axios'; function run(axios: any) { axios.get('/local'); }")).toEqual([]);
    });

    test("classifies XHR as HTTP and long-lived protocols separately", () => {
        const findings = inspect(
            'new XMLHttpRequest(); new window.WebSocket("wss://example.test"); const Feed = EventSource; new Feed("/events");',
        );
        expect(findings.map(({ rule, severity }) => ({ rule, severity }))).toEqual([
            { rule: "ui.network.http", severity: "WARNING" },
            { rule: "ui.network.websocket", severity: "INFO" },
            { rule: "ui.network.eventsource", severity: "INFO" },
        ]);
        expect(
            inspect("function run(WebSocket: any, XMLHttpRequest: any) { new WebSocket(); new XMLHttpRequest(); }"),
        ).toEqual([]);
    });

    test("uses exact infrastructure paths and preserves browser helper findings", () => {
        const path = "packages/foundation/components/src/binding/source/fetcher.ts";
        expect(inspect("fetch(url)", { path })[0]).toMatchObject({
            severity: "INFO",
            message: expect.stringContaining("declarative cms-source"),
        });
        const editorPath = "packages/surfaces/cms-control/src/components/editorSystemV2/";
        expect(inspect("fetch(url)", { path: `${editorPath}documentLoad.ts` })[0]?.severity).toBe("WARNING");
        expect(inspect("fetch(url)", { path: `${editorPath}documentMutations.ts` })[0]?.severity).toBe("INFO");
        expect(
            inspect("fetch(url)", { path: path.replace("source/fetcher.ts", "submit/submitRequest.ts") })[0]?.severity,
        ).toBe("INFO");
        expect(inspect("fetch(url)", { path: path.replace("fetcher.ts", "helper.ts") })[0]?.severity).toBe("WARNING");
        expect(inspect("fetch(url)", { path: `/other/${path}` })[0]?.severity).toBe("WARNING");
        expect(
            inspect("fetch(url)", { path: "packages/surfaces/cms-control/src/core/admin/helper.ts" })[0]?.severity,
        ).toBe("WARNING");
    });

    test("preserves TypeScript generics, optional calls and explicit function invocation", () => {
        expect(inspect('const run = <T>(value: T) => fetch("/items");')).toHaveLength(1);
        expect(
            inspect('fetch?.("/items"); window.fetch.call(window, "/items"); fetch.apply(window, ["/items"]);'),
        ).toHaveLength(3);
        expect(
            inspect('const view = <button onClick={() => fetch("/items")}>Load</button>;', { path: "ui.tsx" }),
        ).toHaveLength(1);
    });

    test("resolves imported client destructuring and namespace exports without counting requests twice", () => {
        const findings = inspect(`
            import * as module from 'axios'; import { $fetch as request } from 'ofetch';
            const {get} = module.default;
            get('/items'); module.default.create().post('/items'); request('/items');
        `);
        expect(findings).toHaveLength(3);
        expect(inspect("import type axios from 'axios'; axios('/items');")).toEqual([]);
    });
});
