import { resolveFixtureContract } from "../ulviaProviderFixture";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { compileProviderRoutes } from "../../src/transport/routes";
import { expect, test } from "bun:test";
import type { HttpBoundCapability as CapabilityDefinition } from "../../src/transport/routes";
import { decodeProviderContractInput } from "../../src/transport/input";

test("decodes canonical wire names into their declared input properties", async () => {
    const request = new Request("http://provider.test/uploads/file-a?part-offset=7", {
        method: "PUT",
        headers: {
            "content-type": "application/octet-stream",
            "upload-token": "upload-token-long-enough",
        },
        body: new Blob(["file contents"]),
    });

    const decoded = await decodeProviderContractInput(request, new URL(request.url), capability(), {
        "upload-id": "file-a",
    });

    expect(decoded.input).toEqual({
        uploadId: "file-a",
        offset: 7,
        uploadToken: "upload-token-long-enough",
    });
    expect(await new Response(decoded.binaryBody?.stream).text()).toBe("file contents");
});

test("preserves standard HTTP field syntax for explicitly raw headers", async () => {
    const definition = {
        input: {
            type: "object",
            properties: {
                range: { type: "string", maxLength: 128 },
                ifRange: { type: "string", maxLength: 160 },
            },
            required: [],
        },
        binding: {
            id: "http",
            transport: "http",
            input: {
                headers: {
                    range: { property: "range", encoding: "http-field" },
                    "if-range": { property: "ifRange", encoding: "http-field" },
                },
            },
        },
    } as unknown as CapabilityDefinition;
    const request = new Request("http://provider.test/files/file-a/generation-a", {
        headers: { range: "bytes=0-7", "if-range": '"different"' },
    });

    const decoded = await decodeProviderContractInput(request, new URL(request.url), definition, {});

    expect(decoded.input).toEqual({ range: "bytes=0-7", ifRange: '"different"' });
});

function capability(): CapabilityDefinition {
    return {
        input: {
            type: "object",
            properties: {
                uploadId: { type: "string", maxLength: 128 },
                offset: { type: "integer", minimum: 0 },
                uploadToken: { type: "string", minLength: 20, maxLength: 512, sensitive: true },
                bytes: { type: "binary", maxBytes: 1_024 },
            },
            required: ["uploadId", "offset", "uploadToken", "bytes"],
        },
        binding: {
            id: "http",
            transport: "http",
            input: {
                path: { "upload-id": "uploadId" },
                query: { "part-offset": "offset" },
                headers: {
                    "upload-token": { property: "uploadToken", encoding: "uri-component" },
                },
                body: { binaryProperty: "bytes" },
            },
        },
    } as unknown as CapabilityDefinition;
}

test("provider aliases decode the selected binding rather than the first HTTP binding", async () => {
    const response = { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} };
    const admitted = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "ulvia.cms.example",
        publisherId: "ulvia.official",
        name: "Alias fixture",
        version: "1.0.0",
        capabilities: [
            {
                id: "find",

                access: "public",
                behavior: { sensitive: false, effect: "query", execution: "sync" },
                input: {
                    type: "object",
                    properties: { value: { type: "string", maxLength: 40 } },
                    required: ["value"],
                },
                output: { type: "string", maxLength: 40 },
                errors: [],
                bindings: [
                    {
                        id: "first",
                        transport: "http",
                        method: "GET",
                        path: "/first/{first}",
                        input: { path: { first: "value" } },
                        response,
                    },
                    {
                        id: "second",
                        transport: "http",
                        method: "GET",
                        path: "/second/{second}",
                        input: { path: { second: "value" } },
                        response,
                    },
                    { id: "agent", transport: "mcp" },
                ],
            },
        ],
    });
    const routes = compileProviderRoutes([resolveFixtureContract(admitted)]);
    expect(routes).toHaveLength(2);
    const request = new Request("https://provider.test/second/selected");
    const route = routes.find((candidate) => candidate.match("GET", "/second/selected"));
    expect(route).toBeDefined();
    const decoded = await decodeProviderContractInput(
        request,
        new URL(request.url),
        route!.capability,
        route!.match("GET", "/second/selected")!,
    );
    expect(decoded.input).toEqual({ value: "selected" });
});
