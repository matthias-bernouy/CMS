import { expect } from "bun:test";
import { resolve } from "node:path";
import type { Page } from "playwright";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import { createConnectedProviderLogger } from "@bernouy/ulvia-provider/sdk/node";
import type { mcpContainers } from "../containers";
import { readProviderCredential } from "./credentials";
import { invoke } from "../observability";

type Stack = Awaited<ReturnType<typeof mcpContainers>>;
export async function exerciseProviders(f: Stack, page: Page) {
    await page.goto(`${f.kernelUrl}/login`);
    await page.getByLabel(/^(Email address|Adresse e-mail)$/u).fill(f.administrator.email);
    await page.getByLabel(/^(Password|Mot de passe)$/u).fill(f.administrator.password);
    await Promise.all([
        page.waitForURL(/\/admin$/u),
        page.getByRole("button", { name: /^(Sign in|Se connecter)$/u }).click(),
    ]);
    await page.goto(`${f.kernelUrl}/admin/providers/connect`);
    await page
        .getByRole("heading", { name: /^(Connect a Provider|Connecter un Provider)$/u, exact: true })
        .waitFor({ timeout: 15_000 })
        .catch(async (error) => {
            throw new Error(
                `${error}\nRendered provider page: ${(await page.locator("body").innerText()).slice(0, 1800)}`,
            );
        });
    console.info("[provider-docker] connection form visible");
    const upstream = await readProviderCredential(f.providerName, `${f.id}-named`);
    const form = page.locator('form[cms-mutation="ulvia.cms.installations:preview-provider-connection as preview"]');
    await form.locator('[name="providerId"]').fill("ulvia.official");
    await form.locator('[name="version"]').fill("0.1.0");
    await form.locator('[name="endpoint"]').fill("http://ulvia-provider:5103");
    await form.locator('[name="token"]').fill(upstream.token);
    const previewResponse = page.waitForResponse(
        (response) => response.url().endsWith("/preview-provider-connection") && response.request().method() === "POST",
    );
    await form.getByRole("button", { name: /^(Review connection|Examiner la connexion)$/u }).click();
    const preview = await previewResponse;
    console.info("[provider-docker] preview returned");
    expect(preview.status()).toBe(200);
    const reviewed = await preview.json();
    expect(JSON.stringify(reviewed)).not.toContain(upstream.token);
    expect(reviewed.requests).toContainEqual(
        expect.objectContaining({ contractId: "ulvia.cms.observability", capabilityId: "logs.append" }),
    );
    await page
        .getByRole("heading", { name: /^(Requested capability access|Accès demandés aux capabilities)$/u, exact: true })
        .waitFor();
    await f.restartProvider();
    const approvalResponse = page.waitForResponse(
        (response) => response.url().endsWith("/approve-provider-connection") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^(Approve connection|Approuver la connexion)$/u, exact: true }).click();
    const approval = await approvalResponse;
    console.info("[provider-docker] approval returned");
    expect(approval.status()).toBe(200);
    await page.waitForURL(/\/admin\/providers$/u);
    const inventory = await page.request.get(
        `${f.kernelUrl}/.cms/query/ulvia.cms.installations/list-provider-installations`,
    );
    expect(inventory.status()).toBe(200);
    const { installations } = await inventory.json();
    const installationId = installations.find(
        (item: { accountId: string }) => item.accountId === reviewed.accountId,
    )?.id;
    expect(installationId).toBeString();
    const command = async (capability: string, input: unknown) => {
        const response = await page.request.post(`${f.kernelUrl}/.cms/mutation/ulvia.cms.installations/${capability}`, {
            data: input,
        });
        expect(response.status()).toBe(200);
        return response.json();
    };
    const access = async () => {
        const response = await page.request.fetch(
            `${f.kernelUrl}/.cms/query/ulvia.cms.installations/get-provider-access`,
            { method: "QUERY", data: { installationId } },
        );
        expect(response.status()).toBe(200);
        return response.json();
    };
    const connected = await readProviderCredential(f.providerName, `${f.id}-named`, installationId);
    expect(connected.cmsUrl).toBe(f.kernelUrl);
    const client = new GatewayProviderClient({
        cmsUrl: f.kernelUrl,
        token: connected.token,
        allowPrivateAddresses: true,
    });
    const path = resolve(
        import.meta.dir,
        "../../../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/cms/ulvia.cms.observability/definition.json",
    );
    const release = (await admitContractReleaseJson(await Bun.file(path).text())).release;
    const entry = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        level: "info",
        event: "docker.provider.called",
        attributes: {},
    };
    expect((await client.invoke(release, "logs.append", { entries: [entry] })).output).toMatchObject({ stored: 1 });
    expect((await client.invoke(release, "logs.append", { entries: [entry] })).output).toMatchObject({ duplicates: 1 });
    await expect(client.invoke(release, "logs.query", {})).rejects.toMatchObject({ retryable: false, status: 403 });
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
    await page.goto(`${f.kernelUrl}/admin/providers/access?ulvia-official-provider-access-id=${installationId}`);
    await page
        .getByRole("heading", { name: /^(Requested capability access|Accès demandés aux capabilities)$/u, exact: true })
        .waitFor();
    const rotatedResponse = page.waitForResponse(
        (response) => response.url().endsWith("/pair-provider-connection") && response.request().method() === "POST",
    );
    await page
        .getByRole("button", {
            name: /^(Pair or rotate connection|Appairer ou renouveler la connexion)$/u,
            exact: true,
        })
        .click();
    expect((await rotatedResponse).status()).toBe(200);
    await page.waitForURL(/\/admin\/providers$/u);
    await expect(
        client.invoke(release, "logs.append", { entries: [{ ...entry, id: crypto.randomUUID() }] }),
    ).rejects.toMatchObject({ status: 401 });
    const rotated = await readProviderCredential(f.providerName, `${f.id}-named`, installationId);
    expect(rotated.token === connected.token).toBe(false);
    const fresh = new GatewayProviderClient({ cmsUrl: f.kernelUrl, token: rotated.token, allowPrivateAddresses: true });
    expect(
        (await fresh.invoke(release, "logs.append", { entries: [{ ...entry, id: crypto.randomUUID() }] })).output,
    ).toMatchObject({ stored: 1 });
    await command("set-provider-status", {
        installationId,
        expectedRevision: (await access()).revision,
        action: "revoke",
    });
    await expect(
        fresh.invoke(release, "logs.append", { entries: [{ ...entry, id: crypto.randomUUID() }] }),
    ).rejects.toMatchObject({ status: 401 });
    await f.restartProvider();
    await expect(
        fresh.invoke(release, "logs.append", { entries: [{ ...entry, id: crypto.randomUUID() }] }),
    ).rejects.toMatchObject({ status: 401 });
}
