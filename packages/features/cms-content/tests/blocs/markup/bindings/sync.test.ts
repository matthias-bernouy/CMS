import { describe, expect, test } from "bun:test";
import { CMS_BINDING_ATTRIBUTES } from "@bernouy/cms-content/bindings";
import { nativeBindingAttributeIssue } from "@bernouy/cms-content";
import { nativeBindingElementIssue } from "../../../../src/blocs/core/validation/nativeBindings";

describe("cms-sync validation", () => {
    test("accepts scoped targets and rejects ambiguous keys", () => {
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "@page:ulvia--mossa--editor")).toBeNull();
        expect(
            nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "@persistent:ulvia--mossa--theme.mode"),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "ulvia--mossa--editor")).toContain(
            "target is invalid",
        );
        expect(
            nativeBindingAttributeIssue(
                CMS_BINDING_ATTRIBUTES.queryListen,
                "@page:ulvia--mossa--editor @param:ulvia--mossa--search",
            ),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.queryListen, "ulvia--mossa--editor")).toContain(
            "listeners",
        );
        expect(
            nativeBindingAttributeIssue(
                CMS_BINDING_ATTRIBUTES.syncSelect,
                "lastSuccess.requestId input.email outcome.kind",
            ),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.syncSelect, "data data.id")).toContain("selection");
    });

    test("reserves producer selections for synchronized queries and mutations", () => {
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-sync": "@page:ulvia--mossa--products",
                "cms-sync-select": "data.items outcome.kind",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("form", {
                "cms-mutation": "ulvia/catalog.items:create as mutation",
                "cms-sync": "@page:ulvia--mossa--mutation",
                "cms-sync-select": "lastSuccess.requestId",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("input", {
                "cms-sync": "@page:ulvia--mossa--filter",
                "cms-sync-select": "value",
            }),
        ).toContain("structured query and mutation producers");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-sync-select": "data",
            }),
        ).toContain("requires cms-sync");
    });

    test("separates remote producers from local consumers", () => {
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-sync": "@page:ulvia--mossa--products",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia--mossa--products as products",
                "cms-sync": "@page:ulvia--mossa--products",
            }),
        ).toContain("cannot republish");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia--mossa--products as products",
                "cms-query-refresh": "focus",
            }),
        ).toContain("cannot declare remote query controls");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia--mossa--products as products",
                "cms-query-listen": "@page:ulvia--mossa--revision",
            }),
        ).toContain("cannot declare remote query controls");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query-listen": "@page:ulvia--mossa--revision",
            }),
        ).toContain("requires cms-query");
        expect(
            nativeBindingElementIssue("section", {
                "cms-queries": "@page:ulvia--mossa--products as products @session:ulvia--mossa--user as user",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-queries": "@session:ulvia--mossa--user as user",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-queries": "@page:ulvia--mossa--products as products",
            }),
        ).toContain("conflicts");
        expect(
            nativeBindingElementIssue("section", {
                "cms-queries": "@page:ulvia--mossa--products as products",
                "cms-sync": "@page:ulvia--mossa--copy",
            }),
        ).toContain("cannot publish");
    });

    test("requires query boundaries to own rendered content", () => {
        for (const tag of [
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "svg",
            "track",
            "wbr",
        ]) {
            expect(
                nativeBindingElementIssue(tag, {
                    "cms-query": "ulvia/catalog.items:list as products",
                }),
            ).toContain("cannot own a query renderer");
            expect(
                nativeBindingElementIssue(tag, {
                    "cms-queries": "@page:ulvia--mossa--products as products",
                }),
            ).toContain("cannot own a query renderer");
        }

        for (const tag of ["section", "ul", "tbody", "select", "atlas-dofficial--atlas--panel"]) {
            expect(
                nativeBindingElementIssue(tag, {
                    "cms-query": "ulvia/catalog.items:list as products",
                }),
            ).toBeNull();
        }
    });

    test("prevents structured query state from being written into URL parameters", () => {
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "ulvia/catalog.items:list as products",
                "cms-sync": "@param:ulvia--mossa--products",
            }),
        ).toContain("cannot publish structured state");
    });

    test("keeps binary and multi-value controls in their owning forms", () => {
        expect(
            nativeBindingElementIssue("input", {
                [CMS_BINDING_ATTRIBUTES.sync]: "@page:ulvia--mossa--files",
                type: "file",
            }),
        ).toContain("form submission");
        expect(
            nativeBindingElementIssue("select", {
                [CMS_BINDING_ATTRIBUTES.sync]: "@page:ulvia--mossa--options",
                multiple: "",
            }),
        ).toContain("explicit collection value contract");
    });
});
