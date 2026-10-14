import { describe, expect, test } from "bun:test";
import { CMS_BINDING_ATTRIBUTES } from "@bernouy/cms-content/bindings";
import { nativeBindingAttributeIssue } from "@bernouy/cms-content";
import { nativeBindingElementIssue } from "../../../../src/blocs/core/validation/nativeBindings";

describe("cms-sync validation", () => {
    test("accepts scoped targets and rejects ambiguous keys", () => {
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "@page:ulvia-official-editor")).toBeNull();
        expect(
            nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "@persistent:ulvia-official-theme.mode"),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.sync, "ulvia-official-editor")).toContain(
            "target is invalid",
        );
        expect(
            nativeBindingAttributeIssue(
                CMS_BINDING_ATTRIBUTES.queryListen,
                "@page:ulvia-official-editor @param:ulvia-official-search",
            ),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.queryListen, "ulvia-official-editor")).toContain(
            "listeners",
        );
    });

    test("separates remote producers from local consumers", () => {
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "catalog.items:list as products",
                "cms-sync": "@page:ulvia-official-products",
            }),
        ).toBeNull();
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia-official-products as products",
                "cms-sync": "@page:ulvia-official-products",
            }),
        ).toContain("cannot republish");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia-official-products as products",
                "cms-query-refresh": "focus",
            }),
        ).toContain("cannot declare remote query controls");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "@page:ulvia-official-products as products",
                "cms-query-listen": "@page:ulvia-official-revision",
            }),
        ).toContain("cannot declare remote query controls");
        expect(
            nativeBindingElementIssue("section", {
                "cms-query-listen": "@page:ulvia-official-revision",
            }),
        ).toContain("requires cms-query");
    });

    test("prevents structured query state from being written into URL parameters", () => {
        expect(
            nativeBindingElementIssue("section", {
                "cms-query": "catalog.items:list as products",
                "cms-sync": "@param:ulvia-official-products",
            }),
        ).toContain("cannot publish structured state");
    });

    test("keeps binary and multi-value controls in their owning forms", () => {
        expect(
            nativeBindingElementIssue("input", {
                [CMS_BINDING_ATTRIBUTES.sync]: "@page:ulvia-official-files",
                type: "file",
            }),
        ).toContain("form submission");
        expect(
            nativeBindingElementIssue("select", {
                [CMS_BINDING_ATTRIBUTES.sync]: "@page:ulvia-official-options",
                multiple: "",
            }),
        ).toContain("explicit collection value contract");
    });
});
