import { describe, expect, test } from "bun:test";
import {
    integrationRegistry,
    parseIntegrationImportRequest,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations DTO parsing", () => {
    test("has no implicit definitions in the public registry", () => {
        expect(integrationRegistry()).toEqual([]);
    });

    test("rejects malformed manual source artifacts before import execution", () => {
        expect(() => parseIntegrationImportRequest({
            definition: { kind: "broken", label: "Broken", inputs: [], artifacts: [{ type: "source", source: {} }] },
            answers: {},
        })).toThrow(/definition\.artifacts\.0\.source\.id/);
    });

    test("rejects malformed manual header artifacts before import execution", () => {
        expect(() => parseIntegrationImportRequest({
            definition: {
                kind: "bad-header",
                label: "Bad Header",
                inputs: [],
                artifacts: [{
                    type: "source",
                    source: {
                        id: "bad-header",
                        meta: { name: "Bad Header" },
                        endpoints: [{
                            endpointId: "list",
                            method: "GET",
                            targetUrl: "https://api.example.com/items",
                            params: [],
                            headers: [{}],
                        }],
                    },
                }],
            },
            answers: {},
        })).toThrow(/definition\.artifacts\.0\.source\.endpoints\.0\.headers\.0\.name/);
    });

    test("rejects invalid manual definitions", () => {
        expect(() => parseIntegrationImportRequest({
            definition: {
                kind: "bad-select",
                label: "Bad select",
                inputs: [{ name: "plan", label: "Plan", type: "select", required: true }],
            },
            answers: { plan: "pro" },
        })).toThrow(/select inputs must declare at least one option/);

        expect(() => parseIntegrationImportRequest({
            definition: {
                kind: "reserved",
                label: "Reserved",
                inputs: [{ name: "kind", label: "Kind", type: "text" }],
            },
            answers: { kind: "value" },
        })).toThrow(/reserved integration field name/);
    });

    test("rejects unsafe url input answers", () => {
        expect(() => parseIntegrationImportRequest({
            kind: "url-test",
            answers: { endpoint: "http://127.0.0.1" },
        }, [{
            kind: "url-test",
            label: "URL Test",
            inputs: [{ name: "endpoint", label: "Endpoint", type: "url", required: true }],
        }])).toThrow(/blocked/);
    });

    test("rejects malformed manual ui metadata", () => {
        expect(() => parseIntegrationImportRequest({
            definition: { kind: "bad-ui", label: "Bad UI", inputs: [], ui: { instructions: ["not-a-pair"] } },
            answers: {},
        })).toThrow(/definition\.ui\.instructions\.0/);
    });

    test("rejects invalid site-provided input definitions at runtime", () => {
        const definition = {
            kind: "site-select",
            label: "Site select",
            inputs: [{ name: "plan", label: "Plan", type: "select", required: true }],
        } as IntegrationDefinition;

        expect(() => parseIntegrationImportRequest(
            { kind: "site-select", answers: { plan: "pro" } },
            [definition],
        )).toThrow(/select inputs must declare at least one option/);
    });

    test("uses defaults for empty string answers and accepts numeric boolean answers", () => {
        const request = parseIntegrationImportRequest({
            kind: "defaults",
            answers: { branch: "", enabled: 1 },
        }, [{
            kind: "defaults",
            label: "Defaults",
            inputs: [
                { name: "branch", label: "Branch", type: "text", required: true, defaultValue: "main" },
                { name: "enabled", label: "Enabled", type: "boolean", required: true },
            ],
        }]);

        expect(request.dto.answers).toEqual({ branch: "main", enabled: true });
    });

    test("uses provided definitions for registry and import parsing", () => {
        const definition: IntegrationDefinition = { kind: "stripe", label: "Custom Stripe", inputs: [] };

        expect(integrationRegistry([definition]).filter(item => item.kind === "stripe")).toEqual([definition]);
        expect(parseIntegrationImportRequest({ kind: "stripe", answers: {} }, [definition]).dto.answers).toEqual({});
    });

    test("sanitizes site-provided ui metadata in the registry", () => {
        const definition = {
            kind: "site-ui",
            label: "Site UI",
            inputs: [],
            ui: { mark: "S", instructions: [["Valid", "Pair"], ["Invalid"]], scopes: ["read", 42], checks: ["safe"] },
        } as unknown as IntegrationDefinition;

        const entry = integrationRegistry([definition]).find(item => item.kind === "site-ui");
        expect(entry?.ui).toEqual({ mark: "S", checks: ["safe"] });
    });
});
