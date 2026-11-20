import { expect, test } from "bun:test";
import { createUnixCaptureClient } from "../../src/unix/client";
import { fixture, document, options, result } from "./fixture";

test("shared worker refuses a third job and cancellation releases a slot", async () => {
    let active = 0;
    let released = false;
    const f = await fixture({
        capture: async (_document, _options, signal) => {
            active++;
            try {
                if (!released) {
                    await new Promise<void>((_resolve, reject) => {
                        signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
                    });
                }
                return result();
            } finally {
                active--;
            }
        },
    });
    try {
        const client = createUnixCaptureClient(f.socket);
        const a = new AbortController();
        const b = new AbortController();
        const first = client.capture(document, options, a.signal).catch(() => undefined);
        const second = client.capture(document, options, b.signal).catch(() => undefined);
        const wait = async (count: number) => {
            const until = Date.now() + 2000;
            while (active !== count && Date.now() < until) {
                await Bun.sleep(10);
            }
            expect(active).toBe(count);
        };
        await wait(2);
        await expect(client.capture(document, options)).rejects.toThrow("BUSY");
        a.abort();
        await first;
        await wait(1);
        released = true;
        expect((await client.capture(document, options)).width).toBe(64);
        b.abort();
        await second;
        await wait(0);
    } finally {
        await f.close();
    }
});

test("stopping the worker aborts pending jobs and removes its own socket", async () => {
    let active = false;
    const f = await fixture({
        capture: async (_document, _options, signal) => {
            active = true;
            try {
                await new Promise<void>((_resolve, reject) =>
                    signal!.addEventListener("abort", () => reject(new Error("stopped")), { once: true }),
                );
                return result();
            } finally {
                active = false;
            }
        },
    });
    try {
        const pending = createUnixCaptureClient(f.socket)
            .capture(document, options)
            .catch(() => undefined);
        const until = Date.now() + 1000;
        while (!active && Date.now() < until) {
            await Bun.sleep(10);
        }
        expect(active).toBeTrue();
        await f.server.stop();
        await pending;
        expect(active).toBeFalse();
        expect(await Bun.file(f.socket).exists()).toBeFalse();
    } finally {
        await f.close();
    }
});
