import { expect, test } from "bun:test";
import { memoryEvidence, parseMemoryEvidence } from "./memory";

const fixture = "123\n2147483648\n2147483648\nlow 0\nhigh 0\nmax 7\noom 2\noom_kill 1\noom_group_kill 0\n";

test("memory evidence preserves bounded cgroup peaks and OOM counters without inferring a main-process crash", () => {
    expect(parseMemoryEvidence(fixture)).toEqual({
        currentBytes: 123,
        peakBytes: 2147483648,
        limitBytes: 2147483648,
        oom: 2,
        oomKills: 1,
    });
    expect(parseMemoryEvidence(fixture.replace("\n2147483648\nlow", "\nmax\nlow")).limitBytes).toBeNull();
    for (const value of [
        "",
        "x".repeat(4097),
        fixture.replace("123\n", "-1\n"),
        fixture.replace("123\n", "9007199254740992\n"),
        fixture.replace("\n2147483648\n2147483648", "\n1\n2147483648"),
        fixture.replace("oom_kill 1\n", ""),
        `${fixture}oom 3\n`,
        fixture.replace("oom_kill 1", "oom_kill -1"),
    ]) {
        expect(() => parseMemoryEvidence(value)).toThrow();
    }
});

test("memory collection touches only fixed read-only files in an owned container and omits private diagnostics", async () => {
    const calls: string[][] = [];
    const message = await memoryEvidence("ulvia-mcp-deadbeef-provider", async (args) => {
        calls.push(args);
        return { code: 0, stdout: fixture, stderr: "private diagnostic" };
    });
    expect(calls).toEqual([
        [
            "exec",
            "ulvia-mcp-deadbeef-provider",
            "cat",
            "/sys/fs/cgroup/memory.current",
            "/sys/fs/cgroup/memory.peak",
            "/sys/fs/cgroup/memory.max",
            "/sys/fs/cgroup/memory.events",
        ],
    ]);
    expect(message).toContain("memoryPeakBytes=2147483648");
    expect(message).toContain("cgroupOomKills=1");
    expect(message).not.toContain("private");
    expect(
        await memoryEvidence("ulvia-mcp-deadbeef-provider", async () => {
            throw Error("private credential");
        }),
    ).toBe("memory evidence unavailable");
    await expect(
        memoryEvidence("production-provider", async () => {
            throw Error("Must not run");
        }),
    ).rejects.toThrow("scope");
});
