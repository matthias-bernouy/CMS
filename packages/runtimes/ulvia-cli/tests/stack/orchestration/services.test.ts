import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { runCli } from "../../../src/cli";
import { parseStartVersion } from "../../../src/commands/local/services";
import { assertStartVersion, startLocalServices } from "../../../src/runtime/stack/orchestration/services";
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
        const paths = resolveUlviaPaths(options.environment);
        await ensureUlviaPaths(paths);
        const configPath = join(paths.services, "installation.json");
        await writeFile(configPath, "not-current-state");
        await runCli(["services", "start", "--help"], options);
        await runCli(["start", "--help"], options);
        expect(output.join("\n")).toContain("ulvia services start [--version <version>]");
        expect(output.join("\n")).toContain("ulvia start [--version <version>]");
        expect(await readFile(configPath, "utf8")).toBe("not-current-state");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("service start never changes an initialized stack implicitly", () => {
    const state = {
        images: {
            provider: officialImage("provider", "0.0.1-beta", "a"),
            edge: { component: "edge", version: "0.0.1-beta", digest: `sha256:${"b".repeat(64)}` },
        },
    } as LocalServicesState;

    expect(() => assertStartVersion(state, "0.0.1-beta")).not.toThrow();
    expect(() => assertStartVersion(state, "0.0.2")).toThrow(/ulvia upgrade/);
    expect(() => assertStartVersion(state)).not.toThrow();
});

function officialImage(component: "provider", version: string, digestCharacter: string) {
    return {
        component,
        version,
        digest: `sha256:${digestCharacter.repeat(64)}`,
    } as const;
}

test("missing launch pins over persistent storage refuse before image lookup or credential generation", async () => {
    for (const storage of ["mongo", "cmsFiles"] as const) {
        const root = await mkdtemp(join(tmpdir(), "ulvia-missing-launch-intent-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            const marker = join(paths[storage], "existing-data");
            await writeFile(marker, "preserved");
            await expect(
                startLocalServices(paths, defaultInstallationConfig(), () => undefined, "1.0.0"),
            ).rejects.toThrow("launch state is missing");
            expect(await readFile(marker, "utf8")).toBe("preserved");
            expect(await Bun.file(join(paths.services, "runtime.json")).exists()).toBe(false);
            expect(await Bun.file(join(paths.services, "stack.json")).exists()).toBe(false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});
