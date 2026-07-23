import { describe, expect, spyOn, test } from "bun:test";
import { BunRunner } from "../src/default-implementation/BunRunner";
import { stopServerGracefully } from "../src/default-implementation/gracefulServerStop";

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

    test("graceful stop waits for an active request before closing", async () => {
        let release!: () => void;
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const runner = new BunRunner();
        runner.get("/pending", async () => {
            markStarted();
            await pending;
            return new Response("done");
        });
        runner.start(0);
        try {
            const response = fetch(`http://localhost:${runner.port}/pending`);
            await started;

            let stopped = false;
            const stopping = runner.stopGracefully(1_000).then(() => {
                stopped = true;
            });
            await Promise.resolve();
            expect(stopped).toBe(false);

            release();
            expect(await (await response).text()).toBe("done");
            await stopping;
            expect(stopped).toBe(true);
        } finally {
            release();
            runner.stop();
        }
    });

    test("graceful stop force-closes after its bounded timeout", async () => {
        const calls: Array<boolean | undefined> = [];
        await stopServerGracefully(
            {
                stop(closeActiveConnections) {
                    calls.push(closeActiveConnections);
                    return closeActiveConnections ? Promise.resolve() : new Promise<void>(() => {});
                },
            },
            0,
        );

        expect(calls).toEqual([false, true]);
    });

    test("force-closes before reporting a graceful stop failure", async () => {
        const calls: Array<boolean | undefined> = [];
        const failure = new Error("graceful close failed");
        const stopping = stopServerGracefully({
            stop(closeActiveConnections) {
                calls.push(closeActiveConnections);
                return closeActiveConnections ? Promise.resolve() : Promise.reject(failure);
            },
        });

        await expect(stopping).rejects.toBe(failure);
        expect(calls).toEqual([false, true]);
    });

    test.failing("forwards port and hostname options to Bun.serve", () => {
        const listen = { port: 4123, hostname: "127.0.0.1" };
        const options = captureServeOptions((runner) => {
            (runner.start as unknown as (input: typeof listen) => void)(listen);
        });

        expect(options).toMatchObject(listen);
    });
});
