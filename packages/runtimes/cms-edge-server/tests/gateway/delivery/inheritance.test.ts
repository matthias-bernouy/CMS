import { expect, test } from "bun:test";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { createPublicResourceHandler } from "../../../src/runtime/resources/publicResource";

test("Delivery discovers an inherited replacement and invokes its exact declaring contract", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const base = {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        name: "Delivery",
        publisherId: "ulvia.official",
        version: "1.0.0",
    };
    const capability = (id: string, path: string) => ({
        id,
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: { type: "object", properties: { path: { type: "string", maxLength: 4096 } }, required: ["path"] },
        output: { type: "binary", maxBytes: 8, resource: true },
        errors: [],
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "QUERY",
                path,
                input: { body: true },
                response: { successStatuses: [200], contentTypes: ["application/octet-stream"], errorStatuses: {} },
            },
        ],
    });
    const parent = await admitContractRelease({
        ...base,
        contractId: "example.delivery",
        capabilities: [capability("delivery.resolve-resource", "/resolve")],
    });
    const child = await admitContractRelease({
        ...base,
        contractId: "ulvia.cms.content",
        extends: { contractId: parent.release.contractId, version: parent.release.version, digest: parent.digest },
        capabilities: [capability("other", "/other")],
    });
    await catalogue.publish(parent);
    await catalogue.publish(child);
    const calls: GatewayInvocation[] = [];
    let resolutions = 0;
    const handler = createPublicResourceHandler({
        resolveContract: async ({ contractId }) => {
            resolutions++;
            return (await catalogue.get(contractId, "1.0.0"))!.admission;
        },
        invoke: async (value) => {
            calls.push(value);
            return {
                kind: "binary",
                requestId: crypto.randomUUID(),
                contentType: "application/octet-stream",
                stream: new Response("ok").body!,
                resource: { status: 200, headers: { "content-type": "text/plain" } },
            };
        },
    });
    expect(await (await handler(new Request("https://site.test/"), { kind: "anonymous" })).text()).toBe("ok");
    expect(calls[0]).toMatchObject({ contractId: "example.delivery", capabilityId: "delivery.resolve-resource" });
    expect(resolutions).toBe(2);
    const stale = createPublicResourceHandler({
        resolveContract: async ({ contractId }) =>
            contractId === "ulvia.cms.content" ? child : { ...parent, digest: `sha256:${"0".repeat(64)}` },
        invoke: async () => {
            throw new Error("A stale parent must never be invoked");
        },
    });
    await expect(stale(new Request("https://site.test/"), { kind: "anonymous" })).rejects.toMatchObject({
        code: "stale_route",
    });
});
