import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { createOfficialProviderHandler, OfficialCmsInstanceDiscovery } from "@bernouy/ulvia-official-provider";
import { FileInstanceRegistry, FileSubmissionStore } from "@bernouy/ulvia-official-provider/local-fs";

async function contracts() {
    const load = async (id: string) =>
        (
            await admitContractReleaseJson(
                await readFile(resolve(import.meta.dir, `../../official-repository/contracts/${id}/definition.json`)),
            )
        ).release;
    return {
        catalog: await load("catalog.items"),
        forms: await load("forms.submissions"),
        instances: await load("ulvia.provider.cms-instances"),
        media: await load("media.assets"),
    };
}

async function instanceDiscovery(root: string, probe: () => Promise<boolean> = async () => true) {
    const instances = new OfficialCmsInstanceDiscovery(
        new FileInstanceRegistry(join(root, "instances.json")),
        "default",
        probe,
        () => new Date("2026-10-05T10:00:00.000Z"),
    );
    await instances.registerCurrent({
        id: "default",
        label: "Local CMS",
        lifecycleState: "running",
        coreVersion: "0.1.0",
        contracts: [],
        healthUrl: "http://127.0.0.1:5100/",
    });
    return instances;
}

test("the official provider accepts canonical gateway paths and declared error envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-official-provider-"));
    try {
        const report = {
            protocol: "ulvia-provider/v1",
            providerId: "ulvia.official",
            account: { id: "local-dev", label: "Local" },
            buildVersion: "test",
            manifest: { version: "0.1.0", digest: `sha256:${"0".repeat(64)}` },
            implementations: [],
        } as ProviderRuntimeReport;
        const handler = createOfficialProviderHandler({
            token: "test-token",
            report,
            contracts: await contracts(),
            instances: await instanceDiscovery(root),
            submissions: new FileSubmissionStore(root),
        });
        const request = (path: string, init: RequestInit = {}) =>
            handler(
                new Request(`http://127.0.0.1${path}`, { ...init, headers: { authorization: "Bearer test-token" } }),
            );
        expect((await handler(new Request("http://127.0.0.1/v1/catalog/items"))).status).toBe(401);
        const instanceList = await request("/v1/cms-instances?limit=1");
        expect(instanceList.status).toBe(200);
        expect(await instanceList.json()).toEqual({
            items: [
                {
                    id: "default",
                    label: "Local CMS",
                    lifecycleState: "running",
                    availability: "ready",
                    coreVersion: "0.1.0",
                    observedAt: "2026-10-05T10:00:00.000Z",
                    contracts: [],
                },
            ],
        });
        const current = await request("/v1/cms-instances/current");
        expect(current.status).toBe(200);
        expect((await current.json()).id).toBe("default");
        expect((await request("/v1/cms-instances/private-instance")).status).toBe(404);
        expect((await request("/v1/cms-instances?limit=51")).status).toBe(400);
        const catalog = await request("/v1/catalog/items");
        expect(await catalog.json()).toEqual({
            items: [
                { id: "starter", name: "Starter item" },
                { id: "editorial", name: "Editorial collection" },
                { id: "seasonal", name: "Seasonal selection" },
            ],
        });
        const item = await request(`/v1/catalog/items/${encodeURIComponent(JSON.stringify("editorial"))}`);
        expect(await item.json()).toEqual({ id: "editorial", name: "Editorial collection" });
        const created = await request("/v1/forms/submissions", {
            method: "POST",
            body: JSON.stringify({ email: "test@example.com", message: "Hello" }),
        });
        expect(created.status).toBe(201);
        const { id } = (await created.json()) as { id: string };
        const receipt = await request(`/v1/forms/submissions/${encodeURIComponent(JSON.stringify(id))}`);
        expect(receipt.status).toBe(200);
        expect(await receipt.json()).toEqual({ id, email: "test@example.com", message: "Hello" });
        const missing = await request(`/v1/catalog/items/${encodeURIComponent(JSON.stringify("missing"))}`);
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: { code: "NOT_FOUND" } });
        const media = await request(`/v1/media/${encodeURIComponent(JSON.stringify("starter-mark"))}`);
        expect(media.status).toBe(200);
        expect(media.headers.get("content-type")).toBe("image/svg+xml");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the official provider rejects blank credentials and incompatible contract sets at startup", async () => {
    const releases = await contracts();
    const report = {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.official",
        account: { id: "local-dev", label: "Local" },
        buildVersion: "test",
        manifest: { version: "0.2.0", digest: `sha256:${"0".repeat(64)}` },
        implementations: [],
    } as ProviderRuntimeReport;
    const submissions = new FileSubmissionStore(join(tmpdir(), "unused-ulvia-submissions"));
    const instances = await instanceDiscovery(join(tmpdir(), `unused-ulvia-instances-${crypto.randomUUID()}`));
    expect(() =>
        createOfficialProviderHandler({ token: " ", report, contracts: releases, instances, submissions }),
    ).toThrow("must not be blank");
    expect(() =>
        createOfficialProviderHandler({
            token: "test-token",
            report,
            contracts: { ...releases, catalog: releases.forms },
            instances,
            submissions,
        }),
    ).toThrow("Expected catalog.items");
});
