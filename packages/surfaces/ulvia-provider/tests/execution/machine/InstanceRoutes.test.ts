import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";
import { DefaultProviderCapabilityDispatcher, UlviaProvider } from "../../../src/exports/index";
import { contractRelease, invocationHeaders, providerOptions } from "../../ulviaProviderFixture";

test("one listener uses each authenticated instance's exact bindings and input bounds", async () => {
    const first = await contractRelease();
    const document = JSON.parse(first.canonicalJson);
    document.version = "2.0.0";
    document.capabilities[0].input.properties.value.maxLength = 4;
    document.capabilities[0].bindings[0].path = "/v2/provider/echo/{id}";
    const second = await admitContractReleaseJson(JSON.stringify(document));
    const calls: string[] = [];
    const a = new DefaultProviderCapabilityDispatcher();
    const b = new DefaultProviderCapabilityDispatcher();
    for (const [id, dispatcher] of [
        ["a", a],
        ["b", b],
    ] as const) {
        dispatcher.register("ulvia/cms.fixture", "echo", async (input) => {
            calls.push(id);
            return input;
        });
    }
    const firstOptions = providerOptions([first], a, "instance:a");
    const secondOptions = providerOptions([second], b, "instance:b");
    const runner = new BunRunner();
    new UlviaProvider(runner, {
        logger: firstOptions.logger,
        authenticateControlToken: async () => null,
        authenticateInvocationToken: async (token) =>
            (await firstOptions.authenticateInvocationToken(token)) ??
            (await secondOptions.authenticateInvocationToken(token)),
    });
    const server = serveForTest(runner);
    const request = (instance: string, version: string, path: string, value: string) =>
        server.request("POST", path, {
            headers: {
                ...invocationHeaders(
                    `${instance}-${version}-${value}`,
                    undefined,
                    "echo",
                    `instance:${instance}`,
                    version,
                ),
                "content-type": "application/json",
            },
            body: JSON.stringify({ value }),
        });
    try {
        expect((await request("a", "1.0.0", "/v1/provider/echo/one", "long-value")).status).toBe(200);
        expect((await request("b", "2.0.0", "/v2/provider/echo/two", "ok")).status).toBe(200);
        expect((await request("b", "2.0.0", "/v2/provider/echo/two", "long-value")).status).toBe(400);
        expect((await request("a", "2.0.0", "/v2/provider/echo/one", "ok")).status).toBe(404);
        expect((await request("b", "1.0.0", "/v1/provider/echo/two", "ok")).status).toBe(404);
        expect(calls).toEqual(["a", "b"]);
    } finally {
        await server.stop();
    }
});
