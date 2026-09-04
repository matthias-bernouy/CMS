import { expect } from "bun:test";
import type { DevRuntimeConfig } from "../../src/runtime/config";
import type { DevPorts } from "../../src/runtime/cms";
import { DevClient } from "./devE2eRuntime";

export async function authenticatedClient(config: DevRuntimeConfig, ports: DevPorts): Promise<DevClient> {
    const client = new DevClient(`http://127.0.0.1:${ports.control}`, `http://127.0.0.1:${ports.delivery}`, config);
    await client.login();
    return client;
}

export async function verifySelectiveSourceResolution(client: DevClient): Promise<void> {
    const sourceFree = ["ulvia/blocs/h1", "ulvia/blocs/p"];
    await client.post("/api/integrations/import", {
        kind: "ulvia",
        version: "1.0.0",
        answers: {},
        options: {},
        resources: sourceFree,
    });
    expect(await installationIds(client)).toEqual(["ulvia"]);

    await client.post("/api/integrations/installations/rerun?id=ulvia", {
        resources: [...sourceFree, "ulvia/blocs/commerce-account-sales"],
    });
    expect(await installationIds(client)).toEqual(["commerce", "ulvia"]);
}

export async function installationIds(client: DevClient): Promise<string[]> {
    return (await client.json<Array<{ id: string }>>("/api/integrations/installations")).map(({ id }) => id).sort();
}

export async function catalogueIds(client: DevClient): Promise<string[]> {
    return (await client.json<Array<{ tag: string }>>("/api/bloc/catalogue")).map(({ tag }) => tag);
}

export async function setSubscription(client: DevClient, email: string): Promise<void> {
    const response = await fetch(`${client.deliveryUrl}/.cms/sources/newsletter/setSubscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, subscribed: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: "persist@example.com", subscribed: true });
}

export async function expectSubscription(client: DevClient, email: string): Promise<void> {
    const result = await client.json<{ subscriptions: Array<{ email: string; subscribed: boolean }> }>(
        `/.cms/sources/newsletter/listSubscriptions?q=${encodeURIComponent(email)}`,
    );
    expect(result.subscriptions).toEqual([expect.objectContaining({ email, subscribed: true })]);
}

export async function expectRenderedPage(client: DevClient): Promise<void> {
    const response = await fetch(`${client.deliveryUrl}/ulvia-e2e`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Persistent local site");
    expect(html).toContain("newsletter-subscription");
}
