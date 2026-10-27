export async function provisionInstance(
    providerUrl: string,
    operatorToken: string,
    id: string,
    kernelUrl: string,
    administrator: { email: string; password: string },
) {
    const created = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${operatorToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": id,
        },
        body: JSON.stringify({ label: "Local MCP regression", kernelUrl, administrator }),
        signal: AbortSignal.timeout(90_000),
    });
    if (created.status !== 201) {
        const diagnostic = await fetch(`${providerUrl}/ulvia/operator/instances`, {
            headers: { Authorization: `Bearer ${operatorToken}` },
        });
        const state = (await diagnostic.json()) as { instances: { status: string; failure?: string }[] };
        throw new Error(
            `Instance provisioning failed (${created.status}): ${state.instances.map((item) => item.failure ?? item.status).join("; ")}`,
        );
    }
    const value = (await created.json()) as {
        instance: { status: string };
        credentials: { instanceAccessToken: string };
    };
    if (value.instance.status !== "ready") {
        throw new Error("Instance was not provisioned");
    }
    return value;
}
