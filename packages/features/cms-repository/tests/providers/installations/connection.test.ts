import { describe, expect, test } from "bun:test";
import {
    parseProviderConnectionTarget,
    parseProviderConnectionTargetJson,
    parseProviderGatewayRegistrationRequest,
    parseProviderGatewayRegistrationRequestJson,
    parseProviderGatewayRegistrationResponse,
    parseProviderGatewayRegistrationResponseJson,
    PROVIDER_CONNECTION_PROTOCOL,
} from "@bernouy/cms-repository/providers/installations";
import { registrationDocument } from "./fixtures";

describe("provider connection protocol", () => {
    test("keeps a server-owned endpoint and reference, without a raw API key", () => {
        const target = { endpoint: "https://provider.example.com", providerTokenRef: "${PROVIDER_TOKEN}" };
        expect(parseProviderConnectionTargetJson(JSON.stringify(target))).toEqual(target);
        expect(() => parseProviderConnectionTarget({ ...target, apiKey: "raw-token" })).toThrow();
        expect(() => parseProviderConnectionTarget({ ...target, providerTokenRef: "raw-token" })).toThrow();
        for (const endpoint of [
            "http://provider.example.com",
            "https://user:password@provider.example.com",
            "https://provider.example.com/api",
            "https://provider.example.com/",
            "https://provider.example.com?",
            "https://PROVIDER.example.com",
        ]) {
            expect(() => parseProviderConnectionTarget({ ...target, endpoint })).toThrow();
        }
        for (const endpoint of ["http://127.0.0.1:3000", "http://[::1]:3000"]) {
            expect(parseProviderConnectionTarget({ ...target, endpoint }).endpoint).toBe(endpoint);
        }
    });

    test("parses the sensitive bootstrap request and independent acknowledgement", () => {
        const request = registrationDocument();
        expect(parseProviderGatewayRegistrationRequestJson(JSON.stringify(request))).toEqual(request);
        const response = {
            protocol: "ulvia-provider/v1",
            installationId: request.installationId,
            providerId: "ulvia.example",
            accountId: "account:SHOP_42.prod",
        };
        expect(parseProviderGatewayRegistrationResponseJson(JSON.stringify(response))).toEqual(response);
        expect(() => parseProviderGatewayRegistrationResponse({ ...response, gatewayToken: "unexpected" })).toThrow();
        expect(() =>
            parseProviderGatewayRegistrationResponse({ ...response, protocol: "ulvia-provider/v2" }),
        ).toThrow();
        expect(() => parseProviderGatewayRegistrationResponse({ ...response, accountId: "" })).toThrow();
    });

    test("rejects ambiguous callback URLs, unknown fields, and malformed bearer tokens", () => {
        const request = registrationDocument();
        for (const gatewayUrl of [
            "/relative",
            "http://cms.example.com/ulvia/gateway",
            "https://user:pass@cms.example.com/ulvia/gateway",
            "https://cms.example.com/ulvia/gateway?",
            "https://cms.example.com/ulvia/gateway#",
            "https://cms.example.com/a/../gateway",
        ]) {
            expect(() => parseProviderGatewayRegistrationRequest({ ...request, gatewayUrl })).toThrow();
        }
        expect(() => parseProviderGatewayRegistrationRequest({ ...request, extra: true })).toThrow();
        for (const gatewayToken of ["", "secret with whitespace", "secret\r\nheader:value"]) {
            expect(() => parseProviderGatewayRegistrationRequest({ ...request, gatewayToken })).toThrow();
        }
        try {
            parseProviderGatewayRegistrationRequest({ ...request, gatewayToken: "private token value" });
            throw new Error("Expected parsing to fail");
        } catch (error) {
            expect(String(error)).not.toContain("private token value");
        }
    });

    test("exports immutable metadata, not an HTTP executor", () => {
        expect(PROVIDER_CONNECTION_PROTOCOL.authentication).toBe("bearer");
        expect(PROVIDER_CONNECTION_PROTOCOL.report.path).toBe("/ulvia/report");
        expect(Object.isFrozen(PROVIDER_CONNECTION_PROTOCOL)).toBe(true);
        expect(Object.isFrozen(PROVIDER_CONNECTION_PROTOCOL.registration)).toBe(true);
    });
});
