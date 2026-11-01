import { expect, test } from "bun:test";
import { NodeLogOutput } from "../../src/default-implementation/output/writer";
import { destination } from "./fixture";

test("a slow stdout bounds writes across producers, while stderr remains usable and drain preserves order", () => {
    const stdout = destination();
    const stderr = destination();
    const output = new NodeLogOutput(stdout.stream, stderr.stream, { maxEntries: 2, maxBytes: 16 });
    const first = () => output.write("one\n", "info");
    const second = () => output.write("two\n", "warn");
    first();
    second();
    output.write("three\n", "info");
    output.write("four\n", "info");
    expect(stdout.lines).toEqual(["one\n"]);
    expect(output.stats()).toMatchObject({ queued: 2, bytes: 10, dropped: 1, blocked: 1 });
    output.write("err\n", "error");
    expect(stderr.lines).toEqual(["err\n"]);
    expect(output.stats()).toMatchObject({ queued: 2, dropped: 1 });
    stdout.release();
    expect(stdout.lines).toEqual(["one\n", "two\n"]);
    stdout.release();
    expect(stdout.lines).toEqual(["one\n", "two\n", "three\n"]);
    expect(output.stats().queued).toBe(0);
    stderr.release();
    const report = JSON.parse(stderr.lines[1]!);
    expect(report).toMatchObject({ event: "logging.output.dropped", attributes: { lost: 1, dropped: 1 } });
    stdout.stream.destroy();
    stderr.stream.destroy();
});

test("UTF-8 volume, listener count and queue size stay bounded under a blocked destination", () => {
    const stdout = destination();
    const stderr = destination();
    const output = new NodeLogOutput(stdout.stream, stderr.stream, { maxEntries: 10, maxBytes: 8 });
    for (let index = 0; index < 10_000; index++) {
        output.write("😀\n", "info");
    }
    expect(stdout.lines).toHaveLength(1);
    expect(output.stats()).toMatchObject({ queued: 1, bytes: 5, dropped: 9998 });
    expect(stdout.stream.listenerCount("drain")).toBe(1);
    stdout.release();
    expect(stdout.lines).toHaveLength(2);
    expect(output.stats().queued).toBe(0);
    stdout.stream.destroy();
    stderr.stream.destroy();
});

test("asynchronous destination failure cannot crash logging and drops only its queued records", async () => {
    const stdout = destination();
    const stderr = destination();
    const output = new NodeLogOutput(stdout.stream, stderr.stream);
    output.write("accepted\n", "info");
    output.write("queued\n", "info");
    stdout.stream.destroy(new Error("closed pipe"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(output.stats()).toMatchObject({ queued: 0, dropped: 1, unavailable: 1, destinationFailures: 1 });
    expect(() => output.write("refused\n", "info")).not.toThrow();
    output.write("safe\n", "fatal");
    expect(stderr.lines).toEqual(["safe\n"]);
    expect(output.stats()).toMatchObject({ dropped: 2 });
    stderr.stream.destroy();
});
