import { describe, expect, test } from "bun:test";
import {
    asInterpolation,
    asQuery,
    asQueryInput,
    asQueryListen,
    asRepeat,
    asSource,
    asSourceBody,
    asSyncTarget,
    isCmsQueryParamName,
    isInterpolation,
    parseInterpolation,
    parseQuery,
    parseQueryInput,
    parseQueryListen,
    parseQueryRefresh,
    parseRepeat,
    parseSource,
    parseSourceBody,
    parseSyncTarget,
} from "@bernouy/cms-content/bindings";

describe("binding syntax", () => {
    test("validates stable query-param names", () => {
        expect(isCmsQueryParamName("search")).toBe(true);
        expect(isCmsQueryParamName("catalog.filters")).toBe(true);
        expect(isCmsQueryParamName("filter_racket-weight:gte")).toBe(true);

        expect(isCmsQueryParamName("")).toBe(false);
        expect(isCmsQueryParamName("-filter")).toBe(false);
        expect(isCmsQueryParamName("filter racket:gte")).toBe(false);
        expect(isCmsQueryParamName("filter/racket:gte")).toBe(false);
        expect(isCmsQueryParamName("filter_{racket}:gte")).toBe(false);
    });

    test("formats interpolation expressions", () => {
        expect(asInterpolation("plan.name")).toBe("{{ plan.name }}");
        expect(asInterpolation("  plan.price  ")).toBe("{{ plan.price }}");
    });

    test("parses interpolation expressions", () => {
        expect(parseInterpolation("{{ plan.name }}")).toBe("plan.name");
        expect(parseInterpolation("  {{ plans[0].cta.label }}  ")).toBe("plans[0].cta.label");
        expect(parseInterpolation("plain text")).toBeNull();
        expect(parseInterpolation("{{ }}")).toBeNull();
    });

    test("detects interpolation expressions", () => {
        expect(isInterpolation("{{ plan.name }}")).toBe(true);
        expect(isInterpolation("Hello {{ plan.name }}")).toBe(false);
    });

    test("formats source bindings", () => {
        expect(asSource(" /api/plans ")).toBe("/api/plans");
        expect(asSource("https://example.com/api/plans")).toBe("https://example.com/api/plans");
        expect(asSource({ url: " /api/plans ", alias: " plans " })).toBe("/api/plans as plans");
        expect(asSource({ url: "/.cms/call/catalog/search?limit=5", alias: "addresses" })).toBe(
            "/.cms/call/catalog/search?limit=5 as addresses",
        );
    });

    test("parses source bindings", () => {
        expect(parseSource(" {{BASE_PATH}}/api/plans ")).toEqual({ url: "{{BASE_PATH}}/api/plans" });
        expect(parseSource("/api/plans as plans")).toEqual({ url: "/api/plans", alias: "plans" });
        expect(parseSource("  /.cms/call/catalog/search?limit=5   as   addresses  ")).toEqual({
            url: "/.cms/call/catalog/search?limit=5",
            alias: "addresses",
        });
        expect(parseSource("")).toBeNull();
        expect(parseSource("   ")).toBeNull();
    });

    test("formats and parses source body bindings", () => {
        const body = {
            email: { from: "state" as const, key: "@param:site-email", optional: true },
            minimum: { from: "state" as const, key: " @param:site-racket-minimum ", cast: "number" as const },
            token: { from: "state" as const, key: "@page:site-auth-token", path: ["data", "token"] },
            active: { from: "literal" as const, value: true },
            options: { from: "literal" as const, value: { count: 2, labels: ["Newsletter"] } },
            skipped: undefined,
        };
        const formatted = asSourceBody(body);
        const expected = {
            email: { from: "state", key: "@param:site-email", optional: true },
            minimum: { from: "state", key: "@param:site-racket-minimum", cast: "number" },
            token: { from: "state", key: "@page:site-auth-token", path: ["data", "token"] },
            active: { from: "literal", value: true },
            options: { from: "literal", value: { count: 2, labels: ["Newsletter"] } },
        };
        expect(JSON.parse(formatted)).toEqual(expected);
        expect(parseSourceBody(formatted)).toEqual(expected);
        expect(parseSourceBody("")).toBeNull();
        expect(parseSourceBody("{bad")).toBeNull();
    });

    test("requires one logical target and safe name for queries", () => {
        expect(asQuery({ contractId: "ulvia.cms.pages", capabilityId: "list", name: "pages" })).toBe(
            "ulvia.cms.pages:list as pages",
        );
        expect(parseQuery(" ulvia.cms.pages:list as pages ")).toEqual({
            contractId: "ulvia.cms.pages",
            capabilityId: "list",
            name: "pages",
        });
        expect(asQuery({ sync: { scope: "page", key: "ulvia-official-pages" }, name: "pages" })).toBe(
            "@page:ulvia-official-pages as pages",
        );
        expect(parseQuery(" @session:ulvia-official-user as user ")).toEqual({
            sync: { scope: "session", key: "ulvia-official-user" },
            name: "user",
        });
        for (const value of [
            "ulvia.cms.pages:list",
            "/.cms/call/ulvia.cms.pages/list as pages",
            "ulvia.cms.pages:list as cms",
            "ulvia.cms.pages:list as page-list",
            "ulvia.cms.pages:list as $pages",
            "@page:Ulvia-pages as pages",
            "@global:ulvia-pages as pages",
        ]) {
            expect(parseQuery(value)).toBeNull();
        }
    });

    test("parses bounded synchronized-state targets", () => {
        expect(asSyncTarget({ scope: "persistent", key: "ulvia-official-preferences.theme" })).toBe(
            "@persistent:ulvia-official-preferences.theme",
        );
        expect(parseSyncTarget(" @param:ulvia-official-search ")).toEqual({
            scope: "param",
            key: "ulvia-official-search",
        });
        for (const value of ["page:key", "@page:key/value", "@page:-key", "@memory:key", "@page:KEY"]) {
            expect(parseSyncTarget(value)).toBeNull();
        }
    });

    test("shares typed logical inputs without exposing an HTTP body", () => {
        const encoded = asQueryInput({
            limit: { from: "literal", value: 100 },
            page: { from: "state", key: "@param:site-page" },
        });
        expect(parseQueryInput(encoded)).toEqual({
            limit: { from: "literal", value: 100 },
            page: { from: "state", key: "@param:site-page" },
        });

        const nested = asQueryInput({
            "targets[0][digest]": { from: "state", key: "@param:site-digest" },
        });
        expect(parseQueryInput(nested)).toEqual({
            "targets[0][digest]": { from: "state", key: "@param:site-digest" },
        });
    });

    test("formats and parses bounded explicit query listeners", () => {
        expect(
            asQueryListen([
                { scope: "param", key: "ulvia-official-search" },
                { scope: "page", key: "ulvia-official-revision" },
            ]),
        ).toBe("@param:ulvia-official-search @page:ulvia-official-revision");
        expect(parseQueryListen(" @param:ulvia-official-search @page:ulvia-official-revision ")).toEqual([
            { scope: "param", key: "ulvia-official-search" },
            { scope: "page", key: "ulvia-official-revision" },
        ]);
        expect(parseQueryListen("")).toBeNull();
        expect(parseQueryListen("@page:ulvia-official-revision @page:ulvia-official-revision")).toBeNull();
        expect(parseQueryListen("@unknown:ulvia-official-revision")).toBeNull();
        expect(
            parseQueryListen(Array.from({ length: 17 }, (_, index) => `@page:site-key-${index}`).join(" ")),
        ).toBeNull();
    });

    test("parses bounded query refresh policies", () => {
        expect(parseQueryRefresh("interval(5s) focus reconnect")).toEqual({
            intervalMs: 5_000,
            focus: true,
            reconnect: true,
        });
        expect(parseQueryRefresh("focus")).toEqual({ focus: true, reconnect: false });
        for (const value of ["", "interval(0ms)", "interval(2h)", "focus focus", "manual"]) {
            expect(parseQueryRefresh(value)).toBeNull();
        }
    });

    test("rejects malformed synchronized input targets", () => {
        expect(() =>
            asSourceBody({
                external: { from: "state", key: "@param:site/query" },
            }),
        ).toThrow("Invalid CMS binding input field");
        for (const invalid of [
            '{"external":{"from":"state","key":"@param:site/query"}}',
            '{"external":{"from":"state","key":"@page:site-value","path":["__proto__"]}}',
            '{"external":{"from":"state","key":"@page:site-value","optional":true,"fallback":null}}',
            '{"external":{"from":"raw","value":true}}',
        ]) {
            expect(parseSourceBody(invalid)).toBeNull();
        }
    });

    test("formats repeat bindings", () => {
        expect(asRepeat({ path: "items" })).toBe("items");
        expect(asRepeat({ path: " order.lines ", alias: " line " })).toBe("order.lines as line");
    });

    test("parses repeat bindings", () => {
        expect(parseRepeat("items")).toEqual({ path: "items" });
        expect(parseRepeat("order.lines as line")).toEqual({ path: "order.lines", alias: "line" });
        expect(parseRepeat("  items   as   item  ")).toEqual({ path: "items", alias: "item" });
        expect(parseRepeat("tasks")).toEqual({ path: "tasks" });
        expect(parseRepeat("")).toBeNull();
        expect(parseRepeat("   ")).toBeNull();
    });
});
