import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import {
    createOfficialProviderHandler,
    OfficialCmsInstanceDiscovery,
    OfficialCoreCapabilityError,
} from "@bernouy/ulvia-official-provider";
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
        pages: await load("ulvia.cms.pages"),
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
            core: {
                async invoke(contractId, capabilityId, input) {
                    expect(contractId).toBe("ulvia.cms.pages");
                    if (capabilityId === "get") {
                        expect(input).toEqual({ id: "page-1" });
                        return pageDetails({});
                    }
                    if (capabilityId === "create") {
                        expect(input).toEqual({ path: "/admin/new", title: "New", surface: "control" });
                        return pageDetails({
                            id: "page-2",
                            path: "/admin/new",
                            title: "New",
                            surface: "control",
                            visible: false,
                        });
                    }
                    if (capabilityId === "update") {
                        expect(input).toEqual({ id: "page-1", expectedRevision: 1, description: "Updated" });
                        return pageDetails({ revision: 2, description: "Updated" });
                    }
                    if (capabilityId === "publish") {
                        expect(input).toEqual({ id: "page-1", expectedRevision: 2, visible: false });
                        return pageDetails({ revision: 3, visible: false });
                    }
                    if (capabilityId === "delete") {
                        expect(input).toEqual({ id: "page-1", expectedRevision: 3 });
                        return { id: "page-1", deleted: true };
                    }
                    if (capabilityId === "rename") {
                        if (input.title === "Stale") {
                            throw new OfficialCoreCapabilityError("REVISION_CONFLICT", 409);
                        }
                        expect({ contractId, capabilityId, input }).toEqual({
                            contractId: "ulvia.cms.pages",
                            capabilityId: "rename",
                            input: { id: "page-1", title: "Renamed", expectedRevision: 1 },
                        });
                        return {
                            id: "page-1",
                            revision: 2,
                            surface: "delivery",
                            path: "/",
                            title: "Renamed",
                            visible: true,
                        };
                    }
                    expect({ contractId, capabilityId, input }).toEqual({
                        contractId: "ulvia.cms.pages",
                        capabilityId: "list",
                        input: { limit: 1 },
                    });
                    return {
                        items: [
                            {
                                id: "page-1",
                                revision: 1,
                                surface: "delivery",
                                path: "/",
                                title: "Home",
                                visible: true,
                            },
                        ],
                    };
                },
            },
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
        const pages = await request("/v1/cms/pages?limit=1");
        expect(pages.status).toBe(200);
        expect((await pages.json()).items[0]).toMatchObject({ id: "page-1", surface: "delivery" });
        const pagePath = `/v1/cms/pages/${encodeURIComponent(JSON.stringify("page-1"))}`;
        const page = await request(pagePath);
        expect(page.status).toBe(200);
        expect(await page.json()).toMatchObject({ id: "page-1", content: "<p>Home</p>" });
        const newPage = await request("/v1/cms/pages", {
            method: "POST",
            body: JSON.stringify({ path: "/admin/new", title: "New", surface: "control" }),
        });
        expect(newPage.status).toBe(201);
        expect(await newPage.json()).toMatchObject({ id: "page-2", surface: "control" });
        const updated = await request(pagePath, {
            method: "PUT",
            body: JSON.stringify({ expectedRevision: 1, description: "Updated" }),
        });
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ revision: 2, description: "Updated" });
        const unpublished = await request(`${pagePath}/publication`, {
            method: "POST",
            body: JSON.stringify({ expectedRevision: 2, visible: false }),
        });
        expect(await unpublished.json()).toMatchObject({ revision: 3, visible: false });
        const deleted = await request(`${pagePath}?expectedRevision=3`, { method: "DELETE" });
        expect(await deleted.json()).toEqual({ id: "page-1", deleted: true });
        const renamed = await request(`/v1/cms/pages/${encodeURIComponent(JSON.stringify("page-1"))}`, {
            method: "PATCH",
            body: JSON.stringify({ title: "Renamed", expectedRevision: 1 }),
        });
        expect(renamed.status).toBe(200);
        expect(await renamed.json()).toMatchObject({ id: "page-1", title: "Renamed", revision: 2 });
        const conflict = await request(`/v1/cms/pages/${encodeURIComponent(JSON.stringify("page-1"))}`, {
            method: "PATCH",
            body: JSON.stringify({ title: "Stale", expectedRevision: 1 }),
        });
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: { code: "REVISION_CONFLICT" } });
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

function pageDetails(
    patch: Partial<{
        id: string;
        revision: number;
        surface: "control" | "delivery";
        path: string;
        title: string;
        description: string;
        content: string;
        tags: string[];
        visible: boolean;
    }>,
) {
    return {
        id: "page-1",
        revision: 1,
        surface: "delivery" as const,
        path: "/",
        title: "Home",
        description: "",
        content: "<p>Home</p>",
        tags: [],
        visible: true,
        ...patch,
    };
}

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
        createOfficialProviderHandler({
            token: " ",
            report,
            contracts: releases,
            core: { invoke: async () => ({}) },
            instances,
            submissions,
        }),
    ).toThrow("must not be blank");
    expect(() =>
        createOfficialProviderHandler({
            token: "test-token",
            report,
            contracts: { ...releases, catalog: releases.forms },
            core: { invoke: async () => ({}) },
            instances,
            submissions,
        }),
    ).toThrow("Expected catalog.items");
});
