import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli";
import { parseStartVersion } from "../../../src/commands/local/services";
import { assertStartVersion } from "../../../src/runtime/stack/orchestration/services";
import type { LocalServicesState } from "../../../src/runtime/stack/orchestration/state";

test("service start accepts only an exact optional image version", () => {
    expect(parseStartVersion([])).toBeUndefined();
    expect(parseStartVersion(["--version", "0.0.1-beta"])).toBe("0.0.1-beta");
    expect(() => parseStartVersion(["--version", "latest"])).toThrow(/Invalid Ulvia image version/);
    expect(() => parseStartVersion(["0.0.1-beta"])).toThrow(/Usage: ulvia services start/);
});

test("service and aggregate start expose help without contacting Docker", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-start-help-"));
    const output: string[] = [];
    try {
        const options = {
            environment: { ULVIA_DATA_DIR: root },
            log: (message: string) => output.push(message),
        };
        await runCli(["services", "start", "--help"], options);
        await runCli(["start", "--help"], options);
        expect(output.join("\n")).toContain("ulvia services start [--version <version>]");
        expect(output.join("\n")).toContain("ulvia start [--version <version>]");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("service start never changes an initialized stack implicitly", () => {
    const state = {
        images: {
            provider: officialImage("provider", "0.0.1-beta", "a"),
            repository: officialImage("repository", "0.0.1-beta", "b"),
        },
    } as LocalServicesState;

    expect(() => assertStartVersion(state, "0.0.1-beta")).not.toThrow();
    expect(() => assertStartVersion(state, "0.0.2")).toThrow(/ulvia upgrade provider/);
    expect(() => assertStartVersion(state)).not.toThrow();
});

function officialImage(component: "provider" | "repository", version: string, digestCharacter: string) {
    return {
        component,
        version,
        digest: `sha256:${digestCharacter.repeat(64)}`,
    } as const;
}
