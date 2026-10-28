import { expect } from "bun:test";

interface InstanceConnection {
    providerUrl: string;
    token: string;
}

async function control(connection: InstanceConnection, capabilityId: string, path: string, input: unknown) {
    const response = await fetch(`${connection.providerUrl}${path}`, {
        method: capabilityId === "gateway.route.get" ? "QUERY" : "POST",
        headers: {
            authorization: `Bearer ${connection.token}`,
            "content-type": "application/json",
            "x-ulvia-contract-id": "ulvia.cms.installations",
            "x-ulvia-contract-version": "1.0.0",
            "x-ulvia-capability-id": capabilityId,
            "x-ulvia-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    return response.json();
}

export async function invoke(connection: InstanceConnection, capabilityId: string, input: unknown) {
    const { route: serialized } = await control(connection, "gateway.route.get", "/gateway/route", {
        contractId: "ulvia.cms.observability",
    });
    const route = JSON.parse(serialized);
    const requestId = crypto.randomUUID();
    const issued = await control(connection, "gateway.invocation.issue", "/gateway/invocations", {
        requestId,
        installationId: route.selection.installationId,
        contractId: "ulvia.cms.observability",
        contractVersion: "1.0.0",
        capabilityId,
        ...(capabilityId === "logs.append" ? { systemServiceId: "cms-edge" } : {}),
    });
    return fetch(`${connection.providerUrl}/observability/logs/${capabilityId.slice(5)}`, {
        method: capabilityId === "logs.append" ? "POST" : "QUERY",
        headers: {
            authorization: `Bearer ${issued.token}`,
            "content-type": "application/json",
            "x-ulvia-request-id": requestId,
        },
        body: JSON.stringify(input),
    });
}

export async function exerciseObservability(
    providerUrl: string,
    primaryToken: string,
    secondaryToken: string,
    cmsUrl: string,
): Promise<string> {
    const a = { providerUrl, token: primaryToken };
    await verifyPublicTrace(a, { providerUrl, token: secondaryToken }, cmsUrl);
    const b = { providerUrl, token: secondaryToken };
    const item = {
        id: crypto.randomUUID(),
        time: new Date(Date.now() + 60_000).toISOString(),
        level: "error",
        event: "docker.scope.probe",
        attributes: { password: "do-not-persist", operation: "scope-check", note: "x".repeat(1016) + " token=a" },
    };
    const rejected = await invoke(a, "logs.append", { entries: [item], instanceId: "another-instance" });
    expect(rejected.status).toBe(400);
    const appended = await invoke(a, "logs.append", { entries: [item] });
    expect(appended.status).toBe(200);
    expect(await appended.json()).toMatchObject({ stored: 1, duplicates: 0 });
    expect(await (await invoke(a, "logs.append", { entries: [item] })).json()).toMatchObject({
        stored: 0,
        duplicates: 1,
    });
    expect((await (await invoke(a, "logs.query", { event: "docker.scope.probe" })).json()).items).toEqual([]);
    const query = await invoke(a, "logs.query", {
        event: "docker.scope.probe",
        levels: ["error"],
        timeField: "receivedAt",
    });
    expect(query.status).toBe(200);
    expect((await query.json()).items.map((entry: { id: string }) => entry.id)).toEqual([item.id]);
    expect(
        (await (await invoke(b, "logs.query", { event: "docker.scope.probe", timeField: "receivedAt" })).json()).items,
    ).toEqual([]);
    expect((await invoke(b, "logs.get", { id: item.id })).status).toBe(404);
    const detail = await invoke(a, "logs.get", { id: item.id });
    expect(detail.status).toBe(200);
    const log = await detail.json();
    expect(JSON.stringify(log)).not.toContain("do-not-persist");
    expect(log.attributes.note).toHaveLength(1024);
    expect(log.attributes.note).not.toContain("token=a");
    const aggregate = await invoke(a, "logs.aggregate", {
        event: "docker.scope.probe",
        groupBy: "level",
        timeField: "receivedAt",
    });
    expect(await aggregate.json()).toMatchObject({ total: 1, groups: [{ key: "error", count: 1 }] });
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const logs = await (await invoke(a, "logs.query", { service: "cms-edge", event: "edge.started" })).json();
        if (logs.items.length) {
            return item.id;
        }
        await Bun.sleep(1000);
    }
    throw new Error("The Edge did not deliver its startup journal through the selected contract");
}

export async function verifyObservabilityPersistence(providerUrl: string, token: string, id: string): Promise<void> {
    const response = await invoke({ providerUrl, token }, "logs.get", { id });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, event: "docker.scope.probe" });
}

async function verifyPublicTrace(
    primary: InstanceConnection,
    secondary: InstanceConnection,
    cmsUrl: string,
): Promise<void> {
    const traceId = crypto.randomUUID();
    const response = await fetch(`${cmsUrl}/login`, { headers: { "x-request-id": traceId } });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await (
            await invoke(primary, "logs.query", { traceId, timeField: "receivedAt", limit: 200 })
        ).json();
        const root = result.items.find(
            (entry: { event: string; capabilityId?: string; service: string }) =>
                entry.service === "cms-edge" &&
                entry.event === "gateway.invocation.completed" &&
                entry.capabilityId === "delivery.resolve-path",
        );
        const content = result.items.find(
            (entry: { event: string; parentInvocationId?: string }) =>
                entry.event === "content.delivery.phase" && entry.parentInvocationId === root?.invocationId,
        );
        if (root && content) {
            expect(root.traceId).toBe(traceId);
            expect(content.traceId).toBe(traceId);
            expect(
                (await (await invoke(secondary, "logs.query", { traceId, timeField: "receivedAt" })).json()).items,
            ).toEqual([]);
            return;
        }
        await Bun.sleep(500);
    }
    throw new Error("The public request did not produce correlated Edge and Content observations");
}
