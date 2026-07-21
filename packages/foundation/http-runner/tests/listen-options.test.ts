import { describe, expect, spyOn, test } from "bun:test";
import { BunRunner } from "../src/default-implementation/BunRunner";

type CapturedServeOptions = {
    port?: unknown;
    hostname?: unknown;
};

function captureServeOptions(start: (runner: BunRunner) => void): CapturedServeOptions {
    let captured: CapturedServeOptions | undefined;
    const serve = spyOn(Bun, "serve").mockImplementation((options: CapturedServeOptions) => {
        captured = options;
        return {
            port: 4123,
            stop() {},
        } as unknown as ReturnType<typeof Bun.serve>;
    });
    const log = spyOn(console, "log").mockImplementation(() => {});
    const runner = new BunRunner();

    try {
        start(runner);
        runner.stop();
        if (!captured) {
            throw new Error("Bun.serve was not called");
        }
        return captured;
    } finally {
        runner.stop();
        log.mockRestore();
        serve.mockRestore();
    }
}

describe("BunRunner listen options", () => {
    test("keeps numeric start backward compatible", () => {
        const options = captureServeOptions((runner) => runner.start(4123));

        expect(options.port).toBe(4123);
    });

    test.failing("forwards port and hostname options to Bun.serve", () => {
        const listen = { port: 4123, hostname: "127.0.0.1" };
        const options = captureServeOptions((runner) => {
            (runner.start as unknown as (input: typeof listen) => void)(listen);
        });

        expect(options).toMatchObject(listen);
    });
});
