import { describe, expect, test } from "bun:test";
import { endpointBelongsToSource, validateSource, validateSourceTargetUrl } from "cms-sources/core/validateSource";
import { ep, source } from "./helpers/sourceValidationFixtures";

describe("validateSource target URLs", () => {
    test("rejects unparseable and non-http target URLs", () => {
        expect(validateSource(source({ endpoints: [ep("urn:shop:x", "not a url")] })).some(e => e.includes("targetUrl"))).toBe(true);
        expect(validateSource(source({ endpoints: [ep("urn:shop:x", "ftp://api.shop.com/x")] })).some(e => e.includes("http or https"))).toBe(true);
    });

    test("rejects local/private IP ranges and metadata hosts", () => {
        const blocked = [
            "http://localhost/x",
            "http://api.localhost/x",
            "http://127.0.0.1/x",
            "http://10.1.2.3/x",
            "http://172.16.0.10/x",
            "http://192.168.1.9/x",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/x",
            "http://[fe80::1]/x",
            "http://[fc00::1]/x",
            "http://[::ffff:127.0.0.1]/x",
        ];
        for (const targetUrl of blocked) {
            expect(validateSource(source({ endpoints: [ep("urn:shop:x", targetUrl)] })).some(e => e.includes("targetUrl"))).toBe(true);
        }
    });

    test("allows public targets and explicit blocked-host allowlist", () => {
        expect(validateSource(source({ endpoints: [ep("urn:shop:x", "http://api.shop.com/x")] }))).toEqual([]);
        expect(validateSourceTargetUrl("http://127.0.0.1/x").ok).toBe(false);
        expect(validateSourceTargetUrl("http://127.0.0.1/x", { allowBlockedTargetHosts: ["127.0.0.1"] }).ok).toBe(true);
    });

    test("checks whether an endpoint belongs to a source", () => {
        expect(endpointBelongsToSource("urn:shop:getCart", "urn:shop")).toBe(true);
        expect(endpointBelongsToSource("urn:other:getCart", "urn:shop")).toBe(false);
        expect(endpointBelongsToSource("urn:shop", "urn:shop")).toBe(false);
    });
});
