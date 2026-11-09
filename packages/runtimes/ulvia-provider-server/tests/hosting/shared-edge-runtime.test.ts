import { expect, test } from "bun:test";
import { hostingRuntimeFixture } from "./runtime-fixture";
import { startTestEdge } from "./edge-process";

const mongoUrl = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = mongoUrl ? test : test.skip;

integration(
    "two real Edge processes serve Control and two tenants created through its contracts and fence warmed disabled routes",
    async () => {
        const f = await hostingRuntimeFixture(mongoUrl!);
        const edges: Awaited<ReturnType<typeof startTestEdge>>[] = [];
        let provider: Awaited<ReturnType<typeof f.startProvider>> | undefined;
        try {
            await f.hosting.initialize();
            provider = await f.startProvider();
            edges.push(await startTestEdge());
            const a = edges[0]!;
            const login = async (hostname: string, email: string, password: string) => {
                const response = await a.request(hostname, "/.cms/call/ulvia/cms.access/login-password", {
                    method: "POST",
                    headers: { origin: `http://${hostname}`, "content-type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                expect(response.status, await response.clone().text()).toBe(200);
                await response.text();
                expect(response.headers.getSetCookie().every((value) => !/domain=/iu.test(value))).toBe(true);
                const cookie = response.headers
                    .getSetCookie()
                    .map((value) => value.split(";")[0]!)
                    .join("; ");
                expect(cookie).not.toBe("");
                return cookie;
            };
            const controlCookie = await login(
                "control.localhost",
                "operator@example.test",
                "protected-operator-password",
            );
            const command = (capability: string, input: unknown) =>
                a.request("control.localhost", `/.cms/call/ulvia/cms.hosting/hosting/${capability}`, {
                    method: "POST",
                    headers: {
                        origin: "http://control.localhost",
                        cookie: controlCookie,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(input),
                });
            const sites: string[] = [];
            for (const name of ["one", "two"]) {
                const created = await command("instances.create", {
                    requestId: crypto.randomUUID(),
                    label: name,
                    origin: `http://${name}.localhost`,
                    administrator: { email: `${name}@example.test`, password: "isolated-site-password" },
                });
                expect(created.status, await created.clone().text()).toBe(200);
                const result = await created.json();
                expect(result.instance.status).toBe("ready");
                expect(result).not.toHaveProperty("credentials");
                sites.push(result.instance.id);
            }
            for (const name of ["control", "one", "two"]) {
                const setup = await a.request(`${name}.localhost`, "/.cms/setup");
                expect(setup.status, `${name}: ${setup.status}\n${await a.diagnostics()}`).toBe(200);
                await setup.text();
            }
            expect((await a.request("unknown.localhost", "/")).status).toBe(404);
            const cookie = await login("one.localhost", "one@example.test", "isolated-site-password");
            edges.push(await startTestEdge());
            for (const edge of edges) {
                for (const name of ["one", "two"]) {
                    const identity = await edge.request(
                        `${name}.localhost`,
                        "/.cms/call/ulvia/cms.access/resolve-actor",
                        { headers: { cookie } },
                    );
                    expect(identity.status, await identity.clone().text()).toBe(200);
                    expect((await identity.json()).state).toBe(name === "one" ? "authenticated" : "anonymous");
                    const oauth = await edge.request(`${name}.localhost`, "/.well-known/oauth-protected-resource");
                    expect(oauth.status).toBe(200);
                    expect((await oauth.json()).resource).toBe(`http://${name}.localhost/.cms/mcp`);
                }
            }
            const disabled = await command("instances.disable", { instanceId: sites[0] });
            expect(disabled.status, await disabled.clone().text()).toBe(200);
            await disabled.text();
            for (const edge of edges) {
                expect((await edge.request("one.localhost", "/.cms/setup")).status).toBe(404);
                const response = await edge.request("two.localhost", "/.cms/setup");
                expect(response.status).toBe(200);
                await response.text();
            }
            const response = await edges[1]!.request("control.localhost", "/.cms/setup");
            expect(response.status).toBe(200);
            await response.text();
        } finally {
            await Promise.all(edges.map((edge) => edge.close()));
            await provider?.stop();
            await f.close();
        }
    },
    90_000,
);
