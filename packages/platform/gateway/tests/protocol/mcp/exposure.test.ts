import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";

const context = { siteId: "site:a", actor: { kind: "anonymous" as const } };
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNXcAAAAASUVORK5CYII=",
    "base64",
);
async function fixture(inlineImageBytes?: number, publishImages = true) {
    const contract = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "example/images",
        name: "Images",
        version: "1.0.0",
        publisherId: "example",
        capabilities: ["png", "webp"].map((format) => ({
            id: format,
            access: "public",
            behavior: { sensitive: false, effect: "query", execution: "sync" },
            input: { type: "object", properties: {}, required: [] },
            output: { type: "binary", maxBytes: 128 },
            errors: [],
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "GET",
                    path: `/${format}`,
                    input: {},
                    response: { successStatuses: [200], contentTypes: [`image/${format}`], errorStatuses: {} },
                },
                { id: "mcp", transport: "mcp" },
            ],
        })),
    });
    let lists = 0;
    let targets = 0;
    let publications = 0;
    const binding = new CapabilityMcpBinding({
        inlineImageBytes,
        contracts: async () => {
            lists++;
            return [contract];
        },
        resolveToolContract: async () => {
            targets++;
            return contract;
        },
        invoker: {
            invoke: async (call) => ({
                kind: "binary",
                requestId: "image",
                stream: new Response(png).body!,
                contentType: `image/${call.capabilityId}`,
            }),
        },
        publishBinary: publishImages
            ? async (result) => {
                  publications++;
                  await result.stream.cancel();
                  return { type: "resource_link", uri: "https://resources.test/image", name: "image" };
              }
            : undefined,
    });
    return { binding, counts: () => ({ lists, targets, publications }) };
}

test("inline PNG and existing resource links retain distinct exact output schemas and targeted Gateway calls", async () => {
    const f = await fixture(128);
    const tools = (await f.binding.list(context)).tools;
    const tool = (format: string) => tools.find(({ name }) => name === capabilityToolName("example/images", format))!;
    const schema = (format: string) =>
        (
            tool(format).outputSchema.anyOf[0] as {
                properties: { output: { required: string[]; properties: Record<string, unknown> } };
            }
        ).properties.output;
    expect(schema("png").required).toEqual(["mimeType"]);
    expect(schema("png").properties.uri).toBeUndefined();
    expect(schema("webp").required).toEqual(["uri", "mimeType"]);
    const image = await f.binding.call(tool("png").name, { input: {} }, context);
    expect(image.content).toContainEqual({ type: "image", mimeType: "image/png", data: png.toString("base64") });
    const link = await f.binding.call(tool("webp").name, { input: {} }, context);
    expect(link.structuredContent).toEqual({ output: { uri: "https://resources.test/image", mimeType: "image/webp" } });
    expect(f.counts()).toEqual({ lists: 1, targets: 2, publications: 1 });
});

test("without inline opt-in binary tools keep their published URI schema and resource-link result", async () => {
    const f = await fixture();
    const tool = (await f.binding.list(context)).tools[0]!;
    const output = (
        tool.outputSchema.anyOf[0] as {
            properties: { output: { required: string[]; properties: Record<string, unknown> } };
        }
    ).properties.output;
    expect(output.required).toEqual(["uri", "mimeType"]);
    const result = await f.binding.call(tool.name, { input: {} }, context);
    expect(result.content[0]?.type).toBe("resource_link");
    expect(f.counts().publications).toBe(1);
});

test("inline exposure without a publisher is limited to bounded PNG queries", async () => {
    const inline = await fixture(128, false);
    expect((await inline.binding.list(context)).tools.map(({ name }) => name)).toEqual([
        capabilityToolName("example/images", "png"),
    ]);
    for (const maximum of [undefined, 127, 4194305]) {
        const hidden = await fixture(maximum, false);
        expect((await hidden.binding.list(context)).tools).toEqual([]);
    }
});
