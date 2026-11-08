import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifySecondInstanceIsolation(
    dataRoot: string,
    credentials: { adminPassword: string },
    cmsUrl: string,
    providerUrl: string,
): Promise<void> {
    const [operatorToken, primary] = await Promise.all([
        readFile(join(dataRoot, "services", "provider-operator-token"), "utf8"),
        readFile(join(dataRoot, "instances", "default", "instance.json"), "utf8").then(
            (source) => JSON.parse(source) as { instanceId: string; token: string },
        ),
    ]);
    const created = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": "edge-smoke-second",
        },
        body: JSON.stringify({
            label: "Second isolated instance",
            cmsUrl,
            administrator: { email: "second@ulvia.local", password: credentials.adminPassword },
        }),
    });
    expect(created.status).toBe(201);
    const secondary = (await created.json()) as {
        instance: { id: string };
        credentials: { instanceAccessToken: string };
    };
    expect(secondary.instance.id).not.toBe(primary.instanceId);

    const reports = await Promise.all(
        [primary.token, secondary.credentials.instanceAccessToken].map((token) =>
            fetch(`${providerUrl}/ulvia/report`, { headers: { authorization: `Bearer ${token}` } }).then((response) =>
                response.json(),
            ),
        ),
    );
    expect(reports.map((report) => report.instanceId)).toEqual([primary.instanceId, secondary.instance.id]);
}
