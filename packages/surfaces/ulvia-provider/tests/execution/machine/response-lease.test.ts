import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { DefaultProviderCapabilityDispatcher, UlviaProvider } from "@bernouy/ulvia-provider";
import { contractRelease, invocationHeaders, providerOptions } from "../../ulviaProviderFixture";

test("the Provider surface retains its instance until the response is consumed or cancelled", async () => {
    const contract = await contractRelease();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register("ulvia/cms.fixture", "echo", async (input) => input);
    const options = providerOptions([contract], dispatcher);
    let releases = 0;
    const runner = new BunRunner();
    new UlviaProvider(runner, {
        ...options,
        authenticateInvocationToken: async (token) => {
            const verified = await options.authenticateInvocationToken(token);
            return verified
                ? {
                      ...verified,
                      lease: {
                          ...verified.lease,
                          release: () => {
                              releases++;
                              verified.lease.release();
                          },
                      },
                  }
                : null;
        },
    });
    const request = () =>
        runner.handle(
            new Request("https://provider.example/v1/provider/echo/one", {
                method: "POST",
                headers: { ...invocationHeaders(crypto.randomUUID()), "content-type": "application/json" },
                body: '{"value":"test"}',
            }),
        );
    const consumed = await request();
    expect(consumed.status).toBe(200);
    expect(releases).toBe(0);
    expect(await consumed.json()).toEqual({ id: "one", value: "test" });
    expect(releases).toBe(1);
    const cancelled = await request();
    expect(releases).toBe(1);
    await cancelled.body!.cancel();
    expect(releases).toBe(2);
});
