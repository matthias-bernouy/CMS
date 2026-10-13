import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDevPorts } from "../../src/runtime/dev/ports";
import { inspectDevSupervisor, registerDevSupervisor, stopDevSupervisor } from "../../src/runtime/dev/supervisor";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../src/runtime/paths";

test("the dev supervisor identifies one exact process and clears stale state safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-supervisor-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const unregister = await registerDevSupervisor(paths, resolveDevPorts({}));
        const active = await inspectDevSupervisor(paths);
        expect(active.status).toBe("active");
        expect(active.state?.pid).toBe(process.pid);
        expect(active.state?.dataDirectory).toBe(root);

        const statePath = join(paths.dev, "supervisor.json");
        const state = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
        await unregister();
        await writeFile(statePath, JSON.stringify({ ...state, processStartId: "0" }), "utf8");

        expect((await inspectDevSupervisor(paths)).status).toBe("stale");
        expect(await stopDevSupervisor(paths)).toBe("stale");
        expect((await inspectDevSupervisor(paths)).status).toBe("missing");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
