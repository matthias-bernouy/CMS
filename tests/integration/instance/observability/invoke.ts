import { expect } from "bun:test";

export interface InstanceConnection {
    providerUrl: string;
    token: string;
    controlVersion?: string;
}

async function control(connection: InstanceConnection, capabilityId: string, path: string, input: unknown) {
    if (!connection.controlVersion) {
        const report = await (
            await fetch(`${connection.providerUrl}/ulvia/report`, {
                headers: { authorization: `Bearer ${connection.token}` },
            })
        ).json();
        connection.controlVersion = report.implementations.find(
            (item: { contractId: string }) => item.contractId === "ulvia.cms.installations",
        ).version;
    }
    const response = await fetch(`${connection.providerUrl}${path}`, {
        method: capabilityId === "gateway.route.get" ? "QUERY" : "POST",
        headers: {
            authorization: `Bearer ${connection.token}`,
            "content-type": "application/json",
            "x-ulvia-contract-id": "ulvia.cms.installations",
            "x-ulvia-contract-version": connection.controlVersion!,
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
        contractVersion: route.selection.version,
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
