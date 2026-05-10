import { describe, test, expect } from "bun:test";

import { parseDataProviderCreateDto } from "src/control/core/validation/dataProvider/parseCreateDto";
import { parseDataProviderUpdateDto } from "src/control/core/validation/dataProvider/parseUpdateDto";

const RULES_JSON = JSON.stringify({
    defaults: { on_request: [
        { type: "inject_header", name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
    ] },
    paths: {},
});

describe("parseDataProviderCreateDto — rules + secrets shape", () => {
    test("happy path with valid rules + matching secret", () => {
        const dto = parseDataProviderCreateDto({
            id:        "stripe",
            source:    "url",
            sourceUrl: "https://api.stripe.com/openapi.json",
            rules:     RULES_JSON,
            "secrets.STRIPE_KEY": "sk_xxx",
        });
        expect(dto.id).toBe("stripe");
        expect(dto.rules.defaults?.on_request).toHaveLength(1);
        expect(dto.secrets).toEqual({ STRIPE_KEY: "sk_xxx" });
    });

    test("empty rules = default {paths:{}} (catch-all forward, no extras)", () => {
        const dto = parseDataProviderCreateDto({
            id:        "public-api",
            source:    "url",
            sourceUrl: "https://api.example.com/openapi.json",
        });
        expect(dto.rules).toEqual({ paths: {} });
        expect(dto.secrets).toEqual({});
    });

    test("invalid JSON in rules → InvalidParam on rules", () => {
        expect(() => parseDataProviderCreateDto({
            id:        "valid-id",
            source:    "url",
            sourceUrl: "https://x/y.json",
            rules:     "{ broken",
        })).toThrow(/Not valid JSON/);
    });

    test("forbidden header in inject_header is rejected with the path in the message", () => {
        const badRules = JSON.stringify({
            paths: { "/x": { on_request: [
                { type: "inject_header", name: "Set-Cookie", value: "x" },
            ] } },
        });
        expect(() => parseDataProviderCreateDto({
            id: "valid-id", source: "url", sourceUrl: "https://x/y.json",
            rules: badRules,
        })).toThrow(/forbidden/i);
    });

    test("secret with non-uppercase env name is rejected", () => {
        expect(() => parseDataProviderCreateDto({
            id: "valid-id", source: "url", sourceUrl: "https://x/y.json",
            rules: JSON.stringify({ paths: {} }),
            "secrets.lowercase_key": "v",
        })).toThrow(/Secret name must match/);
    });
});

describe("parseDataProviderUpdateDto — partial patches", () => {
    test("only server in body → only server in DTO", () => {
        const dto = parseDataProviderUpdateDto({ server: "https://api.example.com/v2" });
        expect(dto.server).toBe("https://api.example.com/v2");
        expect(dto.rules).toBeUndefined();
        expect(dto.secrets).toBeUndefined();
    });

    test("rules + secrets in body → both patched together", () => {
        const dto = parseDataProviderUpdateDto({
            rules: RULES_JSON,
            "secrets.STRIPE_KEY": "sk_new",
        });
        expect(dto.rules?.defaults?.on_request).toHaveLength(1);
        expect(dto.secrets).toEqual({ STRIPE_KEY: "sk_new" });
    });

    test("specAuth + rules can be patched independently in the same body", () => {
        const dto = parseDataProviderUpdateDto({
            "specAuth.bearer": "fetch-token",
            rules: JSON.stringify({ paths: {} }),
        });
        expect(dto.specAuth).toEqual({ type: "bearer", token: "fetch-token" });
        expect(dto.rules).toEqual({ paths: {} });
    });
});
