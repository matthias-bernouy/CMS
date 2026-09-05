import { expect } from "bun:test";
import type { DevPorts } from "../../src/runtime/cms";
import type { DevRuntimeConfig } from "../../src/runtime/config";
import { DevClient } from "./devE2eRuntime";

export async function authenticatedClient(config: DevRuntimeConfig, ports: DevPorts): Promise<DevClient> {
    const client = new DevClient(`http://127.0.0.1:${ports.control}`, `http://127.0.0.1:${ports.delivery}`, config);
    await client.login();
    return client;
}

export async function installationIds(client: DevClient): Promise<string[]> {
    return (await client.json<Array<{ id: string }>>("/api/integrations/installations")).map(({ id }) => id).sort();
}

export async function dashboardIds(client: DevClient, sourceId: string): Promise<string[]> {
    const groups =
        await client.json<Array<{ source: { id: string }; dashboards: Array<{ id: string }> }>>("/api/dashboards");
    return (
        groups
            .find(({ source }) => source.id === sourceId)
            ?.dashboards.map(({ id }) => id)
            .sort() ?? []
    );
}

export async function setRecord(client: DevClient, key: string, value: string): Promise<void> {
    const response = await fetch(`${client.deliveryUrl}/.cms/sources/dev-store/upsertRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key, value });
}

export async function expectRecord(client: DevClient, key: string, value: string): Promise<void> {
    const result = await client.json<{ records: Array<{ key: string; value: string }> }>(
        "/.cms/sources/dev-store/listRecords",
    );
    expect(result.records).toContainEqual({ key, value });
}

export async function expectRenderedPage(client: DevClient): Promise<void> {
    const response = await fetch(`${client.deliveryUrl}/local-e2e`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Persistent local site");
    expect(html).toContain("Rendered by the local CMS.");
}
