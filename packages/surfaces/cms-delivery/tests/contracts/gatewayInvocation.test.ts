import { expect, test } from "bun:test";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { handleCapabilityCall } from "cms-delivery/endpoints/capabilityCall.server";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

test("Delivery mounts a capability call that derives site and actor from trusted state", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    new DeliveryCms({
        runner,
        repository: {} as never,
        capabilityGateway: {
            siteId: "site-a",
            invoker: {
                invoke: async (invocation) => {
                    calls.push(invocation);
                    return { kind: "success", status: 200, requestId: "request-1", output: { items: ["one"] } };
                },
            },
        },
    });
    const response = await runner.defaultHandler(
        "POST",
        "/.cms/call",
    )(
        new Request("http://site/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ term: "one" }),
        }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: "request-1", output: { items: ["one"] } });
    expect(calls).toEqual([
        {
            siteId: "site-a",
            contractId: "catalog",
            capabilityId: "item.list",
            origin: "delivery",
            actor: { kind: "anonymous" },
            input: { term: "one" },
        },
    ]);
});

test("Delivery derives authenticated users and refuses malformed or unauthorized calls", async () => {
    const delivery = {
        basePath: "",
        auth: { subject: async () => ({ identifier: "cms-user-1" }) },
        capabilityGateway: {
            siteId: "site-a",
            invoker: {
                invoke: async () => {
                    throw new GatewayError("not_authorized", "denied");
                },
            },
        },
    } as unknown as DeliveryCms;
    const request = (body: string) =>
        new Request("http://site/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
        });
    const denied = await handleCapabilityCall(request("{}"), delivery);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: { code: "not_authorized" } });
    const malformed = await handleCapabilityCall(request('{"term":"one","term":"two"}'), delivery);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: { code: "invalid_input" } });
});

test("Delivery mounts provider file reads with its verified user", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    new DeliveryCms({
        runner,
        repository: {} as never,
        auth: { subject: async () => ({ identifier: "cms-user-1" }) } as never,
        capabilityGateway: {
            siteId: "site-a",
            invoker: {
                invoke: async (invocation) => {
                    calls.push(invocation);
                    return {
                        kind: "binary",
                        status: 200,
                        requestId: "request-1",
                        contentType: "image/png",
                        bytes: new Uint8Array([1, 2]),
                    };
                },
            },
        },
    });
    const response = await runner.defaultHandler(
        "GET",
        "/.cms/media",
    )(new Request("http://site/.cms/media/files/file.read/photo-1"));
    expect(response.status).toBe(200);
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
    expect(calls).toEqual([
        {
            siteId: "site-a",
            contractId: "files",
            capabilityId: "file.read",
            origin: "delivery",
            actor: { kind: "user", subjectId: "cms-user-1" },
            input: { fileId: "photo-1" },
        },
    ]);
});
