import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { runCli } from "../../../src/cli";
import { parseDeploymentVersion } from "../../../src/commands/local/deployment";
import { applyInstallation } from "../../../src/runtime/stack/orchestration/deployment/apply";

test("apply and upgrade accept exact versions while start refuses deployment arguments", async () => {
    expect(parseDeploymentVersion("apply", [])).toBeUndefined();
    expect(parseDeploymentVersion("apply", ["--version", "0.0.1-beta"])).toBe("0.0.1-beta");
    expect(() => parseDeploymentVersion("upgrade", ["--version", "latest"])).toThrow("Invalid Ulvia image version");
    await expect(
        runCli(["start", "--version", "1.0.0"], { environment: { ULVIA_DATA_DIR: "/tmp/ulvia-invalid-start-args" } }),
    ).rejects.toThrow("Usage: ulvia start");
});

test("root deployment help never parses existing installation state or contacts Docker", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-apply-help-"));
    const output: string[] = [];
    try {
        const options = { environment: { ULVIA_DATA_DIR: root }, log: (line: string) => output.push(line) };
        const paths = resolveUlviaPaths(options.environment);
        await ensureUlviaPaths(paths);
        const path = join(paths.services, "installation.json");
        await writeFile(path, "invalid state");
        for (const name of ["apply", "start", "stop", "status", "logs", "upgrade", "configure"]) {
            await runCli([name, "--help"], options);
        }
        expect(output.join("\n")).toContain("ulvia apply [--version <version>]");
        expect(await readFile(path, "utf8")).toBe("invalid state");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("missing deployment intent over persistent storage refuses before image lookup or key creation", async () => {
    for (const storage of ["mongo", "cmsFiles"] as const) {
        const root = await mkdtemp(join(tmpdir(), "ulvia-missing-intent-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            const marker = join(paths[storage], "existing-data");
            await writeFile(marker, "preserved");
            await expect(applyInstallation(paths, {}, () => undefined, "1.0.0")).rejects.toThrow(
                /missing.*state|missing.*storage/,
            );
            expect(await readFile(marker, "utf8")).toBe("preserved");
            expect(await Bun.file(join(paths.services, "runtime.json")).exists()).toBe(false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});
