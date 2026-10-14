import { describe, expect, test } from "bun:test";
import {
    asInterpolation,
    asQuery,
    asQueryInput,
    asQueryParamToken,
    asRepeat,
    asSource,
    asSourceBody,
    asSyncTarget,
    isCmsQueryParamName,
    isInterpolation,
    parseInterpolation,
    parseQuery,
    parseQueryInput,
    parseQueryRefresh,
    parseQueryParamToken,
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

    test("formats and parses query-param tokens", () => {
        const name = "filter_racket-weight:gte";
        expect(asQueryParamToken(name)).toBe(`#{${name}}`);
        expect(asQueryParamToken(` ${name} `)).toBe(`#{${name}}`);
        expect(parseQueryParamToken(`#{${name}}`)).toBe(name);
        expect(parseQueryParamToken(`  #{ ${name} }  `)).toBe(name);

        expect(parseQueryParamToken("#{filter racket:gte}")).toBeNull();
        expect(parseQueryParamToken("#{filter/racket:gte}")).toBeNull();
        expect(parseQueryParamToken("#{filter_racket}:gte}")).toBeNull();
        expect(() => asQueryParamToken("filter racket:gte")).toThrow();
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
        expect(
            asSource({
                url: "/.cms/call/catalog/search",
                alias: "addresses",
                params: {
                    q: { from: "sync", key: "@param:site-address" },
                    minimum: { from: "sync", key: " @param:site-racket-minimum " },
                    delivery: { from: "sync", key: "@page:site-delivery-address" },
                    limit: { from: "raw", value: 5 },
                    type: { from: "raw", value: "housenumber street" },
                    empty: { from: "raw", value: "" },
                    skipped: undefined,
                },
            }),
        ).toBe(
            "/.cms/call/catalog/search?q=@{param:site-address}&minimum=@{param:site-racket-minimum}&delivery=@{page:site-delivery-address}&limit=5&type=housenumber%20street as addresses",
        );
        expect(asSource({ url: "/api/plans?", params: { q: { from: "raw", value: "hello" } } })).toBe(
            "/api/plans?q=hello",
        );
        expect(
            asSource({
                url: "/api/plans?existing=1#results",
                params: { q: { from: "sync", key: "@param:site-search" } },
            }),
        ).toBe("/api/plans?existing=1&q=@{param:site-search}#results");
        expect(() =>
            asSource({
                url: "/api/plans",
                params: { q: { from: "sync", key: "@param:site/filter" } },
            }),
        ).toThrow();
    });

    test("parses source bindings", () => {
        expect(parseSource(" {{BASE_PATH}}/api/plans ")).toEqual({ url: "{{BASE_PATH}}/api/plans" });
        expect(parseSource("/api/plans as plans")).toEqual({ url: "/api/plans", alias: "plans" });
        expect(
            parseSource("  /.cms/call/catalog/search?q=#{address}&delivery=@{deliveryAddress}   as   addresses  "),
        ).toEqual({ url: "/.cms/call/catalog/search?q=#{address}&delivery=@{deliveryAddress}", alias: "addresses" });
        expect(parseSource("")).toBeNull();
        expect(parseSource("   ")).toBeNull();
    });

    test("formats and parses source body bindings", () => {
        const body = {
            email: { from: "sync" as const, key: "@param:site-email" },
            minimum: { from: "sync" as const, key: " @param:site-racket-minimum " },
            token: { from: "sync" as const, key: "@page:site-auth-token" },
            active: { from: "raw" as const, value: true },
            count: { from: "raw" as const, value: 2 },
            label: { from: "raw" as const, value: "Newsletter" },
            skipped: undefined,
        };
        const formatted = asSourceBody(body);
        const expected = {
            email: { from: "sync", key: "@param:site-email" },
            minimum: { from: "sync", key: "@param:site-racket-minimum" },
            token: { from: "sync", key: "@page:site-auth-token" },
            active: { from: "raw", value: true },
            count: { from: "raw", value: 2 },
            label: { from: "raw", value: "Newsletter" },
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
            limit: { from: "raw", value: 100 },
            page: { from: "sync", key: "@param:site-page" },
        });
        expect(parseQueryInput(encoded)).toEqual({
            limit: { from: "raw", value: 100 },
            page: { from: "sync", key: "@param:site-page" },
        });

        const nested = asQueryInput({
            "targets[0][digest]": { from: "sync", key: "@param:site-digest" },
        });
        expect(parseQueryInput(nested)).toEqual({
            "targets[0][digest]": { from: "sync", key: "@param:site-digest" },
        });
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
        const formatted = asSourceBody({
            external: { from: "sync", key: "@param:site/query" },
        });

        expect(formatted).toBe("");
        expect(parseSourceBody('{"external":{"from":"sync","key":"@param:site/query"}}')).toBeNull();
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
