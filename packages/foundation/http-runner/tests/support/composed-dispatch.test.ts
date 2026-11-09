import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";

test("independent route trees dispatch without opening per-tenant sockets", async () => {
    const a = new BunRunner();
    const b = new BunRunner();
    a.get("/", () => new Response("tenant-a"));
    b.get("/", () => new Response("tenant-b"));
    const dispatcher = (request: Request) =>
        new URL(request.url).hostname === "a.localhost" ? a.handle(request) : b.handle(request);
    expect(await (await dispatcher(new Request("http://a.localhost/"))).text()).toBe("tenant-a");
    expect(await (await dispatcher(new Request("http://b.localhost/"))).text()).toBe("tenant-b");
    expect(a.port).toBeUndefined();
    expect(b.port).toBeUndefined();
    a.group("/group", (runner) => runner.get("/test", () => new Response("group")));
    expect(await (await a.handle(new Request("http://a.localhost/group/test"))).text()).toBe("group");
    expect((await a.handle(new Request("http://a.localhost/unknown"))).status).toBe(404);
});
