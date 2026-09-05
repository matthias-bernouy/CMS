import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    REMOTE_INTEGRATION_KIND,
    REMOTE_INTEGRATION_VERSION,
    REMOTE_UPGRADE_DEFINITION,
    REMOTE_UPGRADE_VERSION,
    writeRemoteIntegrationCatalog,
} from "./fixture/catalogFixture";
import {
    assertDelivery,
    assertPersistedPin,
    assertPublicRepository,
    assertRemoteDeployments,
    corruptPinnedObject,
    eventsForPid,
    getControl,
    makeOwnerWritable,
    postControl,
    postControlResponse,
} from "./fixture/acceptanceAssertions";
import { type FixtureProcess, spawnFixture } from "./fixture/processHarness";

const processes: FixtureProcess[] = [];
const roots: string[] = [];

afterEach(async () => {
    const pendingStops = processes.splice(0).map((fixture) => fixture.stop());
    await Promise.allSettled(pendingStops);
    for (const root of roots.splice(0)) {
        await makeOwnerWritable(root);
        await rm(root, { recursive: true, force: true });
    }
});

describe("Lot 0 external integration process acceptance", () => {
    test("installs and upgrades through Control, then restarts and reruns from the durable cache while offline", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-lot0-process-"));
        roots.push(root);
        const repositoryRoot = join(root, "repository");
        await writeRemoteIntegrationCatalog(repositoryRoot);
        const repository = await spawnFixture("repository", { repositoryRoot }, join(root, "repository-process.json"));
        processes.push(repository);
        const repositoryUrl = `http://127.0.0.1:${repository.ready.port}/.cms/repository`;
        await assertPublicRepository(repositoryUrl);

        const config = {
            repositoryUrl,
            cacheRoot: join(root, "cache"),
            installationsPath: join(root, "state", "installations.json"),
            managementLog: join(root, "state", "management.ndjson"),
            repositoryFetchLog: join(root, "state", "repository-fetches.ndjson"),
        };
        const first = await spawnFixture("cms", config, join(root, "cms-first.json"));
        processes.push(first);
        await assertDelivery(first);
        expect(await eventsForPid(config.repositoryFetchLog, first.ready.pid)).toEqual([]);

        const installed = await postControl(first, "/api/integrations/import", {
            kind: REMOTE_INTEGRATION_KIND,
            version: REMOTE_INTEGRATION_VERSION,
            answers: {},
            options: {},
        });
        const initialDigest = String(installed.installation.packageDigest);
        expect(installed.installation).toMatchObject({
            id: REMOTE_INTEGRATION_KIND,
            definitionVersion: REMOTE_INTEGRATION_VERSION,
            definitionSnapshot: { kind: REMOTE_INTEGRATION_KIND, version: REMOTE_INTEGRATION_VERSION },
            status: "success",
        });
        expect(initialDigest).toMatch(/^[a-f0-9]{64}$/);

        const upgraded = await postControl(
            first,
            `/api/integrations/installations/upgrade?id=${encodeURIComponent(REMOTE_INTEGRATION_KIND)}`,
            { version: REMOTE_UPGRADE_VERSION },
        );
        const pinnedDigest = String(upgraded.installation.packageDigest);
        expect(upgraded.installation).toMatchObject({
            definitionVersion: REMOTE_UPGRADE_VERSION,
            definitionSnapshot: { version: REMOTE_UPGRADE_VERSION },
            runCount: 2,
        });
        expect(pinnedDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(pinnedDigest).not.toBe(initialDigest);
        await assertRemoteDeployments(config.managementLog, first.ready.pid, true);
        await assertPersistedPin(config.installationsPath, pinnedDigest);
        expect(
            await getControl(
                first,
                `/api/integrations/installations?id=${encodeURIComponent(REMOTE_INTEGRATION_KIND)}`,
            ),
        ).toMatchObject({
            definitionVersion: REMOTE_UPGRADE_VERSION,
            definition: REMOTE_UPGRADE_DEFINITION,
            packageDigest: pinnedDigest,
        });

        await stopFixture(first);
        await stopFixture(repository);
        const second = await spawnFixture("cms", config, join(root, "cms-second.json"));
        processes.push(second);
        expect(second.ready.pid).not.toBe(first.ready.pid);
        await assertDelivery(second);
        expect(await eventsForPid(config.repositoryFetchLog, second.ready.pid)).toEqual([]);

        const rerun = await postControl(
            second,
            `/api/integrations/installations/rerun?id=${encodeURIComponent(REMOTE_INTEGRATION_KIND)}`,
            {},
        );
        expect(rerun.installation).toMatchObject({
            definitionVersion: REMOTE_UPGRADE_VERSION,
            packageDigest: pinnedDigest,
            status: "success",
            runCount: 3,
        });
        expect(await eventsForPid(config.repositoryFetchLog, second.ready.pid)).toEqual([]);
        await assertRemoteDeployments(config.managementLog, second.ready.pid, false);

        const unavailable = await fetch(`http://127.0.0.1:${second.ready.controlPort}/api/integrations/list`);
        expect(unavailable.status).toBe(503);
        expect(await unavailable.json()).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
        expect(await eventsForPid(config.repositoryFetchLog, second.ready.pid)).toHaveLength(1);

        const persistedBeforeFailure = await readFile(config.installationsPath, "utf8");
        await corruptPinnedObject(config.cacheRoot, pinnedDigest);
        const corruptRerun = await postControlResponse(
            second,
            `/api/integrations/installations/rerun?id=${encodeURIComponent(REMOTE_INTEGRATION_KIND)}`,
            {},
        );
        expect(corruptRerun.status).toBe(503);
        expect(await corruptRerun.json()).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
        expect(await readFile(config.installationsPath, "utf8")).toBe(persistedBeforeFailure);

        const restartedRepository = await spawnFixture(
            "repository",
            { repositoryRoot, port: repository.ready.port },
            join(root, "repository-restarted.json"),
        );
        processes.push(restartedRepository);
        const repaired = await postControl(
            second,
            `/api/integrations/installations/rerun?id=${encodeURIComponent(REMOTE_INTEGRATION_KIND)}`,
            {},
        );
        expect(repaired.installation).toMatchObject({
            definitionVersion: REMOTE_UPGRADE_VERSION,
            packageDigest: pinnedDigest,
            status: "success",
            runCount: 4,
        });
        expect(await readdir(join(config.cacheRoot, ".corrupt"))).toHaveLength(1);
        await assertPersistedPin(config.installationsPath, pinnedDigest);
        expect((await fetch(`http://127.0.0.1:${second.ready.controlPort}/api/integrations/list`)).status).toBe(200);
        await assertDelivery(second);
    }, 10_000);
});

async function stopFixture(fixture: FixtureProcess): Promise<void> {
    processes.splice(processes.indexOf(fixture), 1);
    await fixture.stop();
}
