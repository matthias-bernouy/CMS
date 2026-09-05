import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { allocateReleaseSandboxPorts } from "../../src/release/sandbox/ports";
import { prepareSandboxSupabase } from "../../src/release/sandbox/supabase-config";
import type { DevPorts } from "../../src/runtime/cms";
import { loadOrCreateDevRuntimeConfig } from "../../src/runtime/config";
import { resolveUlviaPaths } from "../../src/runtime/paths";
import { removeReadonlyTree } from "../fixtures";
import {
    authenticatedClient,
    dashboardIds,
    expectRecord,
    expectRenderedPage,
    installationIds,
    setRecord,
} from "./devE2eAssertions";
import { prepareDevRepository } from "./devE2eRepository";
import { destroyDevData, type DevProcess, devPortEnvironment, startDev, stopDev } from "./devE2eRuntime";

const enabled = process.env.ULVIA_RUN_LOCAL_E2E === "1";
const workspace = resolve(import.meta.dir, "../../../../..");
let root: string | undefined;
let dev: DevProcess | undefined;
let ports: DevPorts | undefined;

afterAll(async () => {
    if (dev) {
        await stopDev(dev);
    }
    if (root) {
        await runCli(["dev", "stop"], {
            environment: {
                ULVIA_DATA_DIR: join(root, "data"),
                ...(ports ? devPortEnvironment(ports) : {}),
            },
            log: () => undefined,
        }).catch(() => undefined);
        await destroyDevData(join(root, "data"));
        await removeReadonlyTree(root);
    }
}, 120_000);

describe.skipIf(!enabled)("ulvia dev local system", () => {
    test("persists one source, its data, and a published page across restart", async () => {
        root = await mkdtemp(join(tmpdir(), "ulvia-dev-e2e-"));
        const allocated = await allocateReleaseSandboxPorts();
        const allocatedPorts = allocated.cms;
        ports = allocatedPorts;
        const data = join(root, "data");
        const integrations = join(root, "integration-sources");
        await prepareDevRepository({ workspace, integrations, data });
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: data });
        await prepareSandboxSupabase(paths.supabase, allocated.supabase);
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        dev = await startDev(workspace, data, allocatedPorts);
        await withDevDiagnostics(async () => {
            let client = await authenticatedClient(config, allocatedPorts);
            await client.post("/api/integrations/import", {
                kind: "dev-persistence",
                version: "1.0.0",
                answers: {},
                options: {},
            });
            await setRecord(client, "persistent-record", "stored in local Supabase");
            await expectRecord(client, "persistent-record", "stored in local Supabase");
            expect(await installationIds(client)).toEqual(["dev-persistence"]);
            expect(await dashboardIds(client, "dev-store")).toEqual(["dev-store-records"]);

            await client.post("/api/page", { title: "Local CMS acceptance", path: "/local-e2e" });
            const page = (await client.json<Array<{ id: string; path: string }>>("/api/page/list")).find(
                ({ path }) => path === "/local-e2e",
            );
            expect(page?.id).toBeString();
            if (!page) {
                throw new Error("The local CMS did not persist the acceptance page");
            }
            await client.put("/api/page/content", {
                id: page.id,
                content: "<main><h1>Persistent local site</h1><p>Rendered by the local CMS.</p></main>",
            });
            await client.put(`/api/page/configDetail?id=${encodeURIComponent(page.id)}`, {
                title: "Local CMS acceptance",
                path: "/local-e2e",
                description: "Persistent local CMS verification",
                published: true,
                tags: ["e2e"],
                indexingEnabled: false,
            });
            await expectRenderedPage(client);

            await stopDev(dev!);
            dev = await startDev(workspace, data, allocatedPorts);
            client = await authenticatedClient(config, allocatedPorts);
            await expectRenderedPage(client);
            await expectRecord(client, "persistent-record", "stored in local Supabase");
            expect(await installationIds(client)).toEqual(["dev-persistence"]);
            expect(await dashboardIds(client, "dev-store")).toEqual(["dev-store-records"]);
        });
    }, 600_000);
});

async function withDevDiagnostics<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!dev) {
            throw error;
        }
        const failed = dev;
        dev = undefined;
        await stopDev(failed);
        throw new Error(
            `${error instanceof Error ? error.message : String(error)}\n\nulvia dev output:\n${await failed.output}`,
            { cause: error },
        );
    }
}
