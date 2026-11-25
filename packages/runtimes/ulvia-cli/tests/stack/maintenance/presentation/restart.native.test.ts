import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCommand } from "../../../../src/runtime/process";
import { resolveUlviaPaths } from "../../../../src/runtime/paths";
import { localServicesIdentity } from "../../../../src/runtime/stack/orchestration/state";
import type { LocalServicesState } from "../../../../src/runtime/stack/orchestration/state";
import { startPresentation, stopPresentation } from "../../../../src/runtime/maintenance/presentation/frontend";
import { maintenanceConfiguration } from "../../../../src/runtime/maintenance/presentation/configuration";
const native = process.env.ULVIA_RUN_MAINTENANCE_FRONTEND === "1" ? test : test.skip;
native(
    "the production frontend resumes a stopped owned container and refuses a foreign snapshot before handoff",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-maintenance-restart-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: join(root, "data") });
        const backup = join(root, "checkpoint");
        const directory = `${backup}.presentation`;
        const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
        const port = reservation.port!;
        reservation.stop(true);
        const definition = await readFile(
            new URL("../../../../src/runtime/stack/orchestration/definitions/services.yml", import.meta.url),
            "utf8",
        );
        const state = {
            ...localServicesIdentity(paths),
            installation: { bindAddress: "127.0.0.1", ports: { http: port }, tls: { mode: "disabled" } },
            release: { files: { "services.yml": definition } },
        } as LocalServicesState;
        const name = `${state.projectName}-maintenance`;
        try {
            await mkdir(directory);
            await writeFile(join(directory, "ready.json"), "{}", { mode: 0o600 });
            await writeFile(
                join(directory, "caddy.json"),
                JSON.stringify(
                    maintenanceConfiguration({ schema: "ulvia.maintenance-pages/v1", sites: [], tlsHosts: [] }, 0),
                ),
            );
            await startPresentation(paths, backup, state);
            const read = () => fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
            const first = await read();
            expect(first.status).toBe(503);
            await first.body?.cancel();
            const before = JSON.parse((await runCommand(["docker", "inspect", name])).stdout)[0];
            await runCommand(["docker", "stop", name]);
            await startPresentation(paths, backup, state);
            const after = JSON.parse((await runCommand(["docker", "inspect", name])).stdout)[0];
            expect(after.Id).toBe(before.Id);
            expect(after.State.Running).toBe(true);
            const resumed = await read();
            expect(resumed.status).toBe(503);
            await resumed.body?.cancel();
            const other = join(root, "other");
            await mkdir(`${other}.presentation`);
            await writeFile(`${other}.presentation/ready.json`, "{}", { mode: 0o600 });
            await expect(startPresentation(paths, other, state)).rejects.toThrow("different maintenance frontend");
            const unchanged = await read();
            expect(unchanged.status).toBe(503);
            await unchanged.body?.cancel();
            await stopPresentation(paths);
            expect((await runCommand(["docker", "inspect", name], { allowFailure: true })).exitCode).not.toBe(0);
        } finally {
            await runCommand(["docker", "rm", "--force", name], { allowFailure: true });
            await rm(root, { recursive: true, force: true });
        }
    },
    30000,
);
