import { describe, test, expect } from "bun:test";
import {
    parseUrn, makeProviderUrn, makeEndpointUrn,
    providerUrnOf, isProviderUrn, isEndpointUrn,
} from "cms-gateway/core/urn";

describe("parseUrn", () => {
    test("provider urn", () => {
        expect(parseUrn("urn:shop")).toEqual({ provider: "shop", endpoint: null });
    });
    test("endpoint urn", () => {
        expect(parseUrn("urn:shop:getCart")).toEqual({ provider: "shop", endpoint: "getCart" });
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

describe("make* / providerUrnOf", () => {
    test("makeProviderUrn", () => expect(makeProviderUrn("shop")).toBe("urn:shop"));
    test("makeEndpointUrn", () => expect(makeEndpointUrn("shop", "getCart")).toBe("urn:shop:getCart"));
    test("providerUrnOf of an endpoint urn", () => expect(providerUrnOf("urn:shop:getCart")).toBe("urn:shop"));
    test("providerUrnOf of a provider urn → null", () => expect(providerUrnOf("urn:shop")).toBeNull());
    test("providerUrnOf of garbage → null", () => expect(providerUrnOf("nope")).toBeNull());
});

describe("isProviderUrn / isEndpointUrn", () => {
    test("isProviderUrn", () => {
        expect(isProviderUrn("urn:shop")).toBe(true);
        expect(isProviderUrn("urn:shop:getCart")).toBe(false);
        expect(isProviderUrn("nope")).toBe(false);
    });
    test("isEndpointUrn", () => {
        expect(isEndpointUrn("urn:shop:getCart")).toBe(true);
        expect(isEndpointUrn("urn:shop")).toBe(false);
        expect(isEndpointUrn("nope")).toBe(false);
    });
});
