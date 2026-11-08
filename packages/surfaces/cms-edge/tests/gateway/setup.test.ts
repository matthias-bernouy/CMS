import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import EdgeCms from "cms-edge/EdgeCms";
import { CaptureRunner } from "./support/CaptureRunner";

function fixture(basePath = "/") {
    const runner = new CaptureRunner(basePath);
    const model = { pending: true, fail: false, calls: [] as unknown[], status: 404 };
    const edge = new EdgeCms({
        runner,
        logger: NOOP_LOGGER,
        resolveActor: async () => ({ kind: "anonymous" }),
        resourceHandler: async () => new Response("Original content", { status: model.status }),
        capabilityGateway: {
            siteId: "site-a",
            invoker: {
                invoke: async (input) => {
                    model.calls.push(input);
                    if (model.fail) {
                        throw new Error("Older selected contract");
                    }
                    return { kind: "success", output: { pending: model.pending } } as never;
                },
            },
        },
    });
    return { edge, runner, model };
}

test("native setup serves only static presentation with a restrictive policy and no authentication bypass", async () => {
    const f = fixture();
    const document = await f.runner.endpointHandler(
        "GET",
        "/.cms/setup",
    )(new Request("https://site.example/.cms/setup"));
    expect(document.status).toBe(200);
    expect(await document.text()).toContain("administrator account created during installation");
    expect(document.headers.get("cache-control")).toBe("private, no-store");
    expect(document.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(document.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    const script = await f.runner.endpointHandler(
        "GET",
        "/.cms/setup/app.asset.js",
    )(new Request("https://site.example/.cms/setup/app.asset.js"));
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await script.text()).toContain("login-password");
    expect(f.model.calls).toEqual([]);
    expect(() => f.runner.endpointHandler("POST", "/.cms/setup")).toThrow();
});

test("only a missing home page checks the public setup flag through the Gateway", async () => {
    const f = fixture();
    const handler = f.runner.defaultHandler("GET", "/");
    expect((await handler(new Request("https://site.example/elsewhere"))).status).toBe(404);
    f.model.status = 200;
    expect((await handler(new Request("https://site.example/"))).status).toBe(200);
    expect(f.model.calls).toHaveLength(0);
    f.model.status = 404;
    const response = await handler(new Request("https://site.example/"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/.cms/setup");
    expect(f.model.calls).toHaveLength(1);
    expect(f.model.calls[0]).toMatchObject({
        siteId: "site-a",
        actor: { kind: "anonymous" },
        contractId: "ulvia/cms.resources",
        capabilityId: "initialization.entry",
        input: {},
    });
});

test("completed setup and unavailable older capabilities preserve the original missing home response", async () => {
    const f = fixture("/tenant");
    const handler = f.runner.defaultHandler("GET", "/tenant");
    f.model.pending = false;
    const response = await handler(new Request("https://site.example/tenant/"));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Original content");
    f.model.fail = true;
    expect((await handler(new Request("https://site.example/tenant/"))).status).toBe(404);
    f.model.fail = false;
    f.model.pending = true;
    expect((await handler(new Request("https://site.example/tenant/"))).headers.get("location")).toBe(
        "/tenant/.cms/setup",
    );
});
