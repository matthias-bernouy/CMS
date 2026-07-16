import { describe, expect, test } from "bun:test";
import {
    collectIntegrationDefinitionCspExtras,
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

    test("parses manual source svg metadata before import execution", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "source-svg",
                label: "Source SVG",
                inputs: [],
                artifacts: [{
                    type: "source",
                    source: {
                        id: "items",
                        meta: { name: "Items", icon: "database", svg: "<svg viewBox=\"0 0 24 24\"></svg>" },
                        endpoints: [{
                            endpointId: "getImage",
                            method: "GET",
                            targetUrl: "https://api.example.com/images/{fileId}",
                            timeoutMs: 60_000,
                            responseKind: "file",
                            mediaType: "image/*",
                            params: [{ name: "fileId", in: "path", required: true, type: "string" }],
                        }],
                    },
                }],
            },
            answers: {},
        });

        expect(request.siteIntegrations[0]?.artifacts?.[0]).toEqual({
            type: "source",
            source: {
                id: "items",
                meta: { name: "Items", icon: "database", svg: "<svg viewBox=\"0 0 24 24\"></svg>" },
                endpoints: [{
                    endpointId: "getImage",
                    method: "GET",
                    targetUrl: "https://api.example.com/images/{fileId}",
                    timeoutMs: 60_000,
                    responseKind: "file",
                    mediaType: "image/*",
                    params: [{ name: "fileId", in: "path", required: true, type: "string" }],
                }],
            },
        });
    });

    test("rejects source endpoint timeout overrides outside the runtime bound", () => {
        expect(() => parseIntegrationImportRequest({
            definition: {
                kind: "source-timeout",
                label: "Source timeout",
                inputs: [],
                artifacts: [{
                    type: "source",
                    source: {
                        id: "items",
                        meta: { name: "Items" },
                        endpoints: [{
                            endpointId: "list",
                            method: "GET",
                            targetUrl: "https://api.example.com/items",
                            timeoutMs: 120_001,
                            params: [],
                        }],
                    },
                }],
            },
            answers: {},
        })).toThrow(/timeoutMs.*integer between 1 and 120000/);
    });

    test("parses manual dashboard artifacts before import execution", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "dashboard",
                label: "Dashboard",
                inputs: [],
                artifacts: [{
                    type: "dashboard",
                    dashboard: {
                        id: "items-dashboard",
                        meta: { name: "Items", icon: "database", svg: "<svg viewBox=\"0 0 24 24\"></svg>" },
                        source: "items",
                        views: [
                            {
                                widget: "w-table",
                                id: "itemsTable",
                                source: { endpoint: "list", itemsPath: "items" },
                                rowKey: "id",
                                columns: [
                                    { id: "name", label: "Name", path: "name", primary: true },
                                    { id: "owner", label: "Owner", path: "owner" },
                                ],
                            },
                            {
                                widget: "w-detail",
                                id: "itemDetail",
                                source: { endpoint: "get", params: { id: "$selection.id" }, itemPath: "item" },
                                title: { path: "name", fallback: "Item" },
                                actions: [
                                    {
                                        id: "save",
                                        label: "Save item",
                                        placement: "primary",
                                        endpoint: { endpoint: "update", params: { id: "$resource.id" }, body: { owner: "$field.owner" } },
                                    },
                                    {
                                        id: "delete",
                                        label: "Delete item",
                                        placement: "more",
                                        section: "Other actions",
                                        tone: "danger",
                                        endpoint: { endpoint: "delete", params: { id: "$resource.id" } },
                                        confirm: "Delete this item?",
                                    },
                                    {
                                        id: "export",
                                        label: "Export CSV",
                                        placement: "more",
                                        section: "Share",
                                        endpoint: { endpoint: "exportItems", params: { q: "$param.q" } },
                                    },
                                ],
                                main: [{
                                    id: "general",
                                    title: "General",
                                    fields: [
                                        { id: "owner", label: "Owner", path: "owner", type: "text", required: true },
                                        {
                                            id: "image",
                                            label: "Image",
                                            path: "images",
                                            type: "media",
                                            item: { idPath: "id", urlPath: "url", altPath: "alt" },
                                            actions: { upload: { endpoint: "uploadImage", params: { id: "$resource.id" } } },
                                        },
                                        { id: "website", label: "Website", path: "website", type: "readonly", format: "url" },
                                    ],
                                }],
                            },
                        ],
                    },
                }],
            },
            answers: {},
        });

        expect(request.siteIntegrations[0]?.artifacts?.[0]).toEqual({
            type: "dashboard",
            dashboard: {
                id: "items-dashboard",
                meta: { name: "Items", icon: "database", svg: "<svg viewBox=\"0 0 24 24\"></svg>" },
                source: "items",
                views: [
                    {
                        widget: "w-table",
                        id: "itemsTable",
                        source: { endpoint: "list", itemsPath: "items" },
                        rowKey: "id",
                        columns: [
                            { id: "name", label: "Name", path: "name", primary: true },
                            { id: "owner", label: "Owner", path: "owner" },
                        ],
                    },
                    {
                        widget: "w-detail",
                        id: "itemDetail",
                        source: { endpoint: "get", params: { id: "$selection.id" }, itemPath: "item" },
                        title: { path: "name", fallback: "Item" },
                        actions: [
                            {
                                id: "save",
                                label: "Save item",
                                placement: "primary",
                                endpoint: { endpoint: "update", params: { id: "$resource.id" }, body: { owner: "$field.owner" } },
                            },
                            {
                                id: "delete",
                                label: "Delete item",
                                placement: "more",
                                section: "Other actions",
                                tone: "danger",
                                endpoint: { endpoint: "delete", params: { id: "$resource.id" } },
                                confirm: "Delete this item?",
                            },
                            {
                                id: "export",
                                label: "Export CSV",
                                placement: "more",
                                section: "Share",
                                endpoint: { endpoint: "exportItems", params: { q: "$param.q" } },
                            },
                        ],
                        main: [{
                            id: "general",
                            title: "General",
                            fields: [
                                { id: "owner", label: "Owner", path: "owner", type: "text", required: true },
                                {
                                    id: "image",
                                    label: "Image",
                                    path: "images",
                                    type: "media",
                                    item: { idPath: "id", urlPath: "url", altPath: "alt" },
                                    actions: { upload: { endpoint: "uploadImage", params: { id: "$resource.id" } } },
                                },
                                { id: "website", label: "Website", path: "website", type: "readonly", format: "url" },
                            ],
                        }],
                    },
                ],
            },
        });
    });

    test("parses generated secrets and connector deployment metadata", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "connector",
                label: "Connector",
                inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
                generatedSecrets: [{
                    name: "cmsApiKey",
                    key: "CONNECTOR_{{env answers.id}}_API_KEY",
                    generator: "token",
                    bytes: 32,
                    prefix: "cms_",
                }],
                connectors: [{
                    provider: "supabase",
                    root: "connectors/supabase",
                    dataApiSchemas: ["user_account"],
                    schemas: ["schema.sql"],
                    functions: [{
                        name: "cms-connector",
                        directory: "functions/cms-connector",
                        configPath: "supabase.config.toml",
                        secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
                    }],
                }],
            },
            answers: { id: "main" },
        });

        expect(request.siteIntegrations[0]?.generatedSecrets).toEqual([{
            name: "cmsApiKey",
            key: "CONNECTOR_{{env answers.id}}_API_KEY",
            generator: "token",
            bytes: 32,
            prefix: "cms_",
        }]);
        expect(request.siteIntegrations[0]?.connectors).toEqual([{
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: ["user_account"],
            schemas: [{ path: "schema.sql" }],
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                configPath: "supabase.config.toml",
                secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
            }],
        }]);
    });

    test("parses declarative CSP security metadata", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "secure-embed",
                label: "Secure Embed",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com/v1.0/connect.js"],
                        frame: ["https://connect.stripe.com/embedded/loading"],
                        connect: ["https://api.stripe.com", "https://api.stripe.com/v1/account_sessions"],
                    },
                },
            },
            answers: {},
        });

        expect(request.siteIntegrations[0]?.security).toEqual({
            csp: {
                script: ["https://connect-js.stripe.com"],
                frame: ["https://connect.stripe.com"],
                connect: ["https://api.stripe.com"],
            },
        });
    });

    test("collects CSP extras from integration definitions", () => {
        const extras = collectIntegrationDefinitionCspExtras([
            {
                kind: "one",
                label: "One",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com"],
                        frame: ["https://connect.stripe.com"],
                    },
                },
            },
            {
                kind: "two",
                label: "Two",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com"],
                        connect: ["https://api.stripe.com"],
                    },
                },
            },
        ]);

        expect(extras).toEqual({
            connectExtras: ["https://api.stripe.com"],
            mediaExtras:   [],
            styleExtras:   [],
            scriptExtras:  ["https://connect-js.stripe.com"],
            frameExtras:   ["https://connect.stripe.com"],
        });
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

        expect(() => parseIntegrationImportRequest({
            definition: {
                kind: "bad-csp",
                label: "Bad CSP",
                inputs: [],
                security: { csp: { script: ["not-a-url"] } },
            },
            answers: {},
        })).toThrow(/definition\.security\.csp\.script\.0/);
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
        const definition: IntegrationDefinition = { kind: "test-secret-source", label: "Custom Test secret source", inputs: [] };

        expect(integrationRegistry([definition]).filter(item => item.kind === "test-secret-source")).toEqual([definition]);
        expect(parseIntegrationImportRequest({ kind: "test-secret-source", answers: {} }, [definition]).dto.answers).toEqual({});
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
