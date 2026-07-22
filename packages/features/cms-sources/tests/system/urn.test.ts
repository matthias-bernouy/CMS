import { describe, test, expect } from "bun:test";
import {
    parseUrn,
    makeSourceUrn,
    makeEndpointUrn,
    sourceUrnOf,
    isSourceUrn,
    isEndpointUrn,
} from "cms-sources/core/system/urn";

describe("parseUrn", () => {
    test("source urn", () => {
        expect(parseUrn("urn:shop")).toEqual({ source: "shop", endpoint: null });
    });
    test("endpoint urn", () => {
        expect(parseUrn("urn:shop:getCart")).toEqual({ source: "shop", endpoint: "getCart" });
    });
    test("rejects missing 'urn' prefix", () => {
        expect(parseUrn("shop:getCart")).toBeNull();
    });
    test("rejects empty segments", () => {
        expect(parseUrn("urn:")).toBeNull();
        expect(parseUrn("urn::getCart")).toBeNull();
        expect(parseUrn("urn:shop:")).toBeNull();
    });
    test("rejects too many segments", () => {
        expect(parseUrn("urn:shop:getCart:extra")).toBeNull();
    });
});

describe("make* / sourceUrnOf", () => {
    test("makeSourceUrn", () => expect(makeSourceUrn("shop")).toBe("urn:shop"));
    test("makeEndpointUrn", () => expect(makeEndpointUrn("shop", "getCart")).toBe("urn:shop:getCart"));
    test("sourceUrnOf of an endpoint urn", () => expect(sourceUrnOf("urn:shop:getCart")).toBe("urn:shop"));
    test("sourceUrnOf of a source urn → null", () => expect(sourceUrnOf("urn:shop")).toBeNull());
    test("sourceUrnOf of garbage → null", () => expect(sourceUrnOf("nope")).toBeNull());
});

describe("isSourceUrn / isEndpointUrn", () => {
    test("isSourceUrn", () => {
        expect(isSourceUrn("urn:shop")).toBe(true);
        expect(isSourceUrn("urn:shop:getCart")).toBe(false);
        expect(isSourceUrn("nope")).toBe(false);
    });
    test("isEndpointUrn", () => {
        expect(isEndpointUrn("urn:shop:getCart")).toBe(true);
        expect(isEndpointUrn("urn:shop")).toBe(false);
        expect(isEndpointUrn("nope")).toBe(false);
    });
});
