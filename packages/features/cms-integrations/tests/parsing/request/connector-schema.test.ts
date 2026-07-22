import { describe, expect, test } from "bun:test";
import { parseIntegrationImportRequest } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector schema parsing", () => {
    test("parses SQL manifest schema entries", () => {
        const request = parse([{ manifest: "sql/manifest.json" }]);

        expect(request.siteIntegrations[0]?.connectors?.[0]?.schemas).toEqual([{ manifest: "sql/manifest.json" }]);
    });

    test("rejects ambiguous or malformed SQL schema entries", () => {
        const invalidEntries = [
            { path: "schema.sql", manifest: "sql/manifest.json" },
            { path: "schema.sql", manifest: "" },
            { path: "schema.sql", manifest: 42 },
            { path: "schema.sql", manifest: null },
            { path: "schema.sql", extra: true },
        ];

        for (const entry of invalidEntries) {
            expect(() => parse([entry])).toThrow(/must define exactly one path or manifest/);
        }
    });

    test("requires the selected schema reference to be a non-empty string", () => {
        for (const entry of [{ path: "" }, { manifest: "" }, { manifest: 42 }]) {
            expect(() => parse([entry])).toThrow(/must be a non-empty string/);
        }
    });
});

function parse(schemas: unknown[]) {
    return parseIntegrationImportRequest({
        definition: {
            kind: "connector",
            label: "Connector",
            inputs: [],
            connectors: [{ provider: "supabase", schemas }],
        },
        answers: {},
    });
}
