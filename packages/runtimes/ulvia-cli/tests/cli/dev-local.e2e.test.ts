import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadOrCreateDevRuntimeConfig } from "../../src/runtime/config";
import { resolveUlviaPaths } from "../../src/runtime/paths";
import { runCli } from "../../src/cli";
import { allocateReleaseSandboxPorts } from "../../src/release/sandbox/ports";
import type { DevPorts } from "../../src/runtime/cms";
import { removeReadonlyTree } from "../fixtures";
import {
    authenticatedClient,
    catalogueIds,
    expectRenderedPage,
    expectSubscription,
    installationIds,
    setSubscription,
    verifySelectiveSourceResolution,
} from "./devE2eAssertions";
import { prepareDevRepository } from "./devE2eRepository";
import { destroyDevData, type DevProcess, devPortEnvironment, startDev, stopDev } from "./devE2eRuntime";

const enabled = process.env.ULVIA_RUN_LOCAL_E2E === "1";
const workspace = resolve(import.meta.dir, "../../../../..");
const integrations = join(workspace, "packages/resources/official-integrations/integrations");
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
        await Promise.all([destroyDevData(join(root, "data")), destroyDevData(join(root, "probe-data"))]);
        await removeReadonlyTree(root);
    }
}, 120_000);

describe.skipIf(!enabled)("ulvia dev local system", () => {
    test("persists a selected collection, business data, rendering, and safe upgrades across restart", async () => {
        root = await mkdtemp(join(tmpdir(), "ulvia-dev-e2e-"));
        ports = (await allocateReleaseSandboxPorts()).cms;
        const data = join(root, "data");
        const probeData = join(root, "probe-data");
        await prepareDevRepository({ workspace, integrations, data, fixtureRoot: join(root, "fixture") });
        await mkdir(probeData, { recursive: true });
        await cp(join(data, "repository"), join(probeData, "repository"), { recursive: true });
        dev = await startDev(workspace, probeData, ports);
        let client = await authenticatedClient(
            await loadOrCreateDevRuntimeConfig(resolveUlviaPaths({ ULVIA_DATA_DIR: probeData }).dev),
            ports,
        );
        await withDevDiagnostics(() => verifySelectiveSourceResolution(client));
        await stopDev(dev);
        await runCli(["dev", "stop"], {
            environment: { ULVIA_DATA_DIR: probeData, ...devPortEnvironment(ports) },
            log: () => undefined,
        });

        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: data });
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        dev = await startDev(workspace, data, ports);
        client = await authenticatedClient(config, ports);

        await client.post("/api/integrations/import", {
            kind: "newsletter",
            version: "1.0.0",
            answers: {},
            options: {},
        });
        await setSubscription(client, "PERSIST@Example.COM ");
        await client.post("/api/integrations/installations/upgrade?id=newsletter", { version: "3.0.0" });
        await expectSubscription(client, "persist@example.com");

        const baseResources = ["ulvia/blocs/h1", "ulvia/blocs/p"];
        await client.post("/api/integrations/import", {
            kind: "ulvia",
            version: "1.0.0",
            answers: {},
            options: {},
            resources: baseResources,
        });
        expect(await installationIds(client)).toEqual(["newsletter", "ulvia"]);
        expect(await catalogueIds(client)).toEqual(expect.arrayContaining(["h1", "p"]));
        expect(await catalogueIds(client)).not.toContain("newsletter-subscription");

        const selected = [...baseResources, "ulvia/blocs/newsletter-subscription", "ulvia/blocs/forms-renderer"];
        await client.post("/api/integrations/installations/rerun?id=ulvia", { resources: selected });
        expect(await installationIds(client)).toEqual(["forms", "newsletter", "ulvia"]);
        expect(await catalogueIds(client)).toContain("newsletter-subscription");

        await client.post("/api/page", { title: "Ulvia local E2E", path: "/ulvia-e2e" });
        const page = (await client.json<Array<{ id: string; path: string }>>("/api/page/list")).find(
            ({ path }) => path === "/ulvia-e2e",
        );
        expect(page?.id).toBeString();
        if (!page) {
            throw new Error("The local CMS did not persist the E2E page");
        }
        await client.put("/api/page/content", {
            id: page.id,
            content:
                "<main><h1>Persistent local site</h1><p>Rendered by Ulvia.</p><newsletter-subscription></newsletter-subscription></main>",
        });
        await client.put(`/api/page/configDetail?id=${encodeURIComponent(page.id)}`, {
            title: "Ulvia local E2E",
            path: "/ulvia-e2e",
            description: "Persistent local CMS verification",
            published: true,
            tags: ["e2e"],
            indexingEnabled: false,
        });
        await expectRenderedPage(client);

        await stopDev(dev);
        dev = await startDev(workspace, data, ports);
        client = await authenticatedClient(config, ports);
        await expectRenderedPage(client);
        await expectSubscription(client, "persist@example.com");
        expect(
            (await client.json<{ activeResources: string[] }>("/api/integrations/installations?id=ulvia"))
                .activeResources,
        ).toEqual([...selected].sort());

        await client.post("/api/integrations/installations/upgrade?id=ulvia", { version: "1.1.0" });
        const upgraded = await client.json<{ definitionVersion: string; activeResources: string[] }>(
            "/api/integrations/installations?id=ulvia",
        );
        expect(upgraded.definitionVersion).toBe("1.1.0");
        expect(upgraded.activeResources).toEqual([...selected].sort());
        expect(await catalogueIds(client)).not.toContain("ulvia-e2e-new-resource");

        await expect(
            client.post("/api/integrations/installations/upgrade?id=ulvia", { version: "2.0.0" }),
        ).rejects.toThrow(/resource|ulvia\/blocs\/p/i);
        expect(
            await client.json<{ definitionVersion: string }>("/api/integrations/installations?id=ulvia"),
        ).toMatchObject({ definitionVersion: "1.1.0" });
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
