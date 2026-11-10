import { expect, test } from "bun:test";
import { parseRuntimeLogSelection, runtimeLogLevel } from "../../../src/runtime/stack/logs/selection";
import { streamCommand } from "../../../src/runtime/processStream";
import { profileCliFixture } from "../profiles/fixture";

test("runtime filters combine fields, allow repeated values and reject invalid fields before Docker", () => {
    expect(parseRuntimeLogSelection(["--filter", "component=edge", "--filter", "level=error", "--follow"])).toEqual({
        components: ["edge"],
        services: [],
        levels: ["error"],
        follow: true,
    });
    for (const args of [
        ["provider"],
        ["--filter", "tenant=foreign"],
        ["--filter", "service=../../other"],
        ["--filter", "level=unknown"],
    ]) {
        expect(() => parseRuntimeLogSelection(args)).toThrow();
    }
    expect(runtimeLogLevel('{"s":"E"}')).toBe("error");
    expect(runtimeLogLevel('{"level":"warning"}')).toBe("warn");
    expect(runtimeLogLevel("plain startup message")).toBeUndefined();
});

test("technical log filtering works without CMS user authentication", async () => {
    const fixture = await profileCliFixture();
    try {
        expect((await fixture.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const result = await fixture.run(["logs", "--filter", "component=edge", "--filter", "level=error"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("edge-1 | ");
        expect(result.stdout).toContain("fixture error");
        expect(result.stdout).not.toContain('"level":"info"');
        expect(fixture.state.unauthorized).toBe(0);
    } finally {
        await fixture.close();
    }
});

test("log subprocesses terminate on cancellation and oversized output cannot keep a follow alive", async () => {
    const controller = new AbortController();
    const lines: string[] = [];
    const flight = streamCommand(
        [process.execPath, "-e", 'console.log("ready");setInterval(()=>{},1000)'],
        process.env,
        (line) => {
            lines.push(line);
            controller.abort();
        },
        controller.signal,
    );
    await flight;
    expect(lines).toEqual(["ready"]);
    await expect(
        streamCommand(
            [process.execPath, "-e", 'console.log("😀".repeat(20000));setInterval(()=>{},1000)'],
            process.env,
            () => undefined,
            new AbortController().signal,
        ),
    ).rejects.toThrow("64 KiB");
});

test("a CLI log follower holds no mutation lock and SIGTERM releases all Docker clients", async () => {
    const fixture = await profileCliFixture();
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
        expect((await fixture.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        child = Bun.spawn(
            [
                process.execPath,
                new URL("../../../src/index.ts", import.meta.url).pathname,
                "logs",
                "--filter",
                "component=edge",
                "--follow",
            ],
            {
                env: {
                    ...process.env,
                    PATH: `${fixture.root}/bin:${process.env.PATH}`,
                    ULVIA_DATA_DIR: `${fixture.root}/data`,
                    ULVIA_TEST_DOCKER_ROOT: fixture.root,
                },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain("edge-1 | ");
        const configured = await Promise.race([
            fixture.run(["configure", "--edges", "2"]),
            Bun.sleep(2000).then(() => {
                throw new Error("Log following blocked configuration");
            }),
        ]);
        expect(configured.exitCode).toBe(0);
        expect(child.exitCode).toBeNull();
        child.kill("SIGTERM");
        expect(await Promise.race([child.exited, Bun.sleep(2000).then(() => -1)])).toBe(0);
        await reader.cancel();
        reader.releaseLock();
    } finally {
        if (child && child.exitCode === null) {
            child.kill("SIGKILL");
            await child.exited;
        }
        await fixture.close();
    }
}, 15_000);
