import { repositoryApi } from "../repository/client";
import { expect } from "bun:test";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";
import { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import { createConnectedProviderLogger } from "@bernouy/ulvia-provider/sdk/node";
import type { mcpContainers } from "../containers";
import { readProviderCredential } from "./credentials";
import { invoke } from "../observability";

type Stack = Awaited<ReturnType<typeof mcpContainers>>;
export async function exerciseProviders(f: Stack) {
    const api = repositoryApi(f.cmsUrl);
    const session = await api.session(f.administrator.email, f.administrator.password);
    const command = async (capability: string, input: unknown) => {
        const response = await fetch(`${f.cmsUrl}/.cms/mutation/ulvia/cms.installations/${capability}`, {
            method: "POST",
            headers: { origin: f.cmsUrl, cookie: session.cookie, "content-type": "application/json" },
            body: JSON.stringify(input),
        });
        expect(response.status, await response.clone().text()).toBe(200);
        return response.json();
    };
    const upstream = await readProviderCredential(f.providerName, `${f.id}-named`);
    const manifest = await Bun.file(
        resolve(
            import.meta.dir,
            "../../../../packages/runtimes/ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json",
        ),
    ).json();
    const reviewed = await command("preview-provider-connection", {
        providerId: manifest.providerId,
        version: manifest.version,
        endpoint: "http://ulvia-provider:5103",
        token: upstream.token,
    });
    expect(JSON.stringify(reviewed)).not.toContain(upstream.token);
    expect(reviewed.requests).toContainEqual(
        expect.objectContaining({ contractId: "ulvia/cms.observability", capabilityId: "logs.append" }),
    );
    await f.restartProvider();
    await command("approve-provider-connection", { ticket: reviewed.ticket });
    const inventory = await api.request(
        "ulvia/cms.installations",
        "/list-provider-installations",
        "GET",
        undefined,
        session,
    );
    expect(inventory.status).toBe(200);
    const { installations } = await inventory.json();
    const installationId = installations.find(
        (item: { accountId: string }) => item.accountId === reviewed.accountId,
    )?.id;
    expect(installationId).toBeString();
    const access = async () => {
        const response = await api.request(
            "ulvia/cms.installations",
            "/providers/access",
            "QUERY",
            { installationId },
            session,
        );
        expect(response.status).toBe(200);
        return response.json();
    };
    const connected = await readProviderCredential(f.providerName, `${f.id}-named`, installationId);
    expect(connected.cmsUrl).toBe(f.gatewayUrl);
    const client = new GatewayProviderClient({
        cmsUrl: f.cmsUrl,
        token: connected.token,
        allowPrivateAddresses: true,
    });
    const path = resolve(
        import.meta.dir,
        "../../../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/cms/cms.observability/definition.json",
    );
    const release = (await admitContractReleaseJson(await Bun.file(path).text())).release;
    const entry = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        level: "info",
        event: "docker.provider.called",
        attributes: {},
    };
    expect(
        (await client.invoke(release, "logs.append", { entries: [entry] }, { authority: "ulvia/provider" })).output,
    ).toMatchObject({ stored: 1 });
    expect(
        (await client.invoke(release, "logs.append", { entries: [entry] }, { authority: "ulvia/provider" })).output,
    ).toMatchObject({ duplicates: 1 });
    await expect(client.invoke(release, "logs.query", {}, { authority: "ulvia/provider" })).rejects.toMatchObject({
        retryable: false,
        status: 403,
    });
    const diagnostics = createConnectedProviderLogger({
        client,
        contract: release,
        service: "untrusted-label",
        fallback: () => undefined,
    });
    diagnostics.logger.info("docker.provider.logger");
    await diagnostics.collector.flush();
    expect(diagnostics.collector.stats().queued).toBe(0);
    await diagnostics.collector.close();
    const identity = { providerUrl: await f.providerUrl(), token: f.instanceToken };
    const query = await (await invoke(identity, "logs.query", { event: entry.event })).json();
    expect(query.items).toHaveLength(1);
    expect(query.items[0].service).toBe(`provider:${installationId}`);
    const detail = await (await invoke(identity, "logs.get", { id: query.items[0].id })).json();
    expect(detail.sourceEntryId).toBe(entry.id);
    expect(
        (await (await invoke({ ...identity, token: f.namedToken }, "logs.query", { event: entry.event })).json()).items,
    ).toEqual([]);
    await f.restartProvider();
    const state = await access();
    expect(state.paired).toBe(true);
    await command("pair-provider-connection", { installationId, expectedRevision: state.revision, rotate: true });
    await expect(
        client.invoke(
            release,
            "logs.append",
            { entries: [{ ...entry, id: crypto.randomUUID() }] },
            { authority: "ulvia/provider" },
        ),
    ).rejects.toMatchObject({ status: 403 });
    const rotated = await readProviderCredential(f.providerName, `${f.id}-named`, installationId);
    expect(rotated.token === connected.token).toBe(false);
    const fresh = new GatewayProviderClient({ cmsUrl: f.cmsUrl, token: rotated.token, allowPrivateAddresses: true });
    expect(
        (
            await fresh.invoke(
                release,
                "logs.append",
                { entries: [{ ...entry, id: crypto.randomUUID() }] },
                { authority: "ulvia/provider" },
            )
        ).output,
    ).toMatchObject({ stored: 1 });
    await command("set-provider-status", {
        installationId,
        expectedRevision: (await access()).revision,
        action: "revoke",
    });
    await expect(
        fresh.invoke(
            release,
            "logs.append",
            { entries: [{ ...entry, id: crypto.randomUUID() }] },
            { authority: "ulvia/provider" },
        ),
    ).rejects.toMatchObject({ status: 403 });
    await f.restartProvider();
    await expect(
        fresh.invoke(
            release,
            "logs.append",
            { entries: [{ ...entry, id: crypto.randomUUID() }] },
            { authority: "ulvia/provider" },
        ),
    ).rejects.toMatchObject({ status: 403 });
}
