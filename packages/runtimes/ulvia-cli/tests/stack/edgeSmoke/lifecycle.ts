import { expect } from "bun:test";
import { runCommand } from "../../../src/runtime/process";
import { resolveUlviaPaths } from "../../../src/runtime/paths";
import { loadLocalServicesState } from "../../../src/runtime/stack/orchestration/state";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import type { HostedSite } from "./setup";

export async function verifyPublishedAcrossEdges(
    environment: Record<string, string | undefined>,
    site: HostedSite,
    control: Omit<HostedSite, "id">,
) {
    const state = await loadLocalServicesState(resolveUlviaPaths(environment));
    expect(state?.installation.hosting.edgeCount).toBe(2);
    const origins: string[] = [];
    for (const index of [1, 2]) {
        const result = await runCommand([
            "docker",
            "inspect",
            `${state!.projectName}-edge-${index}-1`,
            "--format",
            "{{json .NetworkSettings.Networks}}",
        ]);
        const address = JSON.parse(result.stdout)[state!.instanceNetwork]?.IPAddress;
        expect(typeof address).toBe("string");
        origins.push(`http://${address}:3000`);
    }
    const readPage = async (origin: string) =>
        fetch(`${origin}/smoke-page`, {
            headers: { host: new URL(site.origin).host },
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
        });
    for (const origin of origins) {
        for (let repeat = 0; repeat < 2; repeat++) {
            const response = await readPage(origin);
            expect(response.status).toBe(200);
            if (repeat === 1) {
                expect(response.headers.get("x-cache")).toBe("HIT");
            }
            expect(await response.text()).toContain("Smoke Page");
        }
    }
    const api = repositoryApi(site.origin);
    const actor = await api.session(site.administrator.email, site.administrator.password);
    const listed = await api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, actor);
    expect(listed.status).toBe(200);
    const pages = (await listed.json()).items;
    expect(pages).toHaveLength(1);
    const current = await api.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pages[0].id }, actor);
    expect(current.status).toBe(200);
    const persisted = await current.json();
    const removed = await api.request(
        "ulvia/cms.content",
        "/pages/delete",
        "POST",
        {
            id: persisted.id,
            expectedRevision: persisted.revision,
        },
        actor,
    );
    expect(removed.status).toBe(200);
    await removed.body?.cancel();
    const absent = await api.request("ulvia/cms.content", "/pages/get", "QUERY", { id: persisted.id }, actor);
    expect(absent.status).toBe(404);
    await absent.body?.cancel();
    for (const origin of origins) {
        const response = await readPage(origin);
        expect(response.status, `${origin}: ${response.headers.get("x-cache")}`).toBe(410);
        await response.body?.cancel();
    }
    await verifyRoutingAcrossEdges(origins, site, control);
}

async function verifyRoutingAcrossEdges(origins: string[], site: HostedSite, control: Omit<HostedSite, "id">) {
    const api = repositoryApi(control.origin);
    const actor = await api.session(control.administrator.email, control.administrator.password);
    const alias = new URL(site.origin);
    alias.hostname = "alias.localhost";
    const readAlias = (origin: string) =>
        fetch(`${origin}/smoke-page`, {
            headers: { host: alias.host },
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
        });
    for (const origin of origins) {
        const missing = await readAlias(origin);
        expect(missing.status).toBe(404);
        await missing.body?.cancel();
    }
    const command = async (capability: string, input: unknown) => {
        const response = await api.request("ulvia/cms.hosting", `/hosting/${capability}`, "POST", input, actor);
        expect(response.status, await response.clone().text()).toBe(200);
        return response.json();
    };
    const claimed = await command("domains.claim", { instanceId: site.id, origin: alias.origin });
    expect(claimed.domain.state).toBe("active");
    for (const origin of origins) {
        const routed = await readAlias(origin);
        expect(routed.status).toBe(308);
        expect(routed.headers.get("location")).toBe(`${site.origin}/smoke-page`);
        await routed.body?.cancel();
    }
    await command("domains.disable", { hostname: alias.hostname, expectedRevision: claimed.domain.revision });
    for (const origin of origins) {
        const disabled = await readAlias(origin);
        expect(disabled.status).toBe(404);
        await disabled.body?.cancel();
    }
    await command("instances.disable", { instanceId: site.id });
    for (const origin of origins) {
        const disabled = await fetch(`${origin}/smoke-page`, {
            headers: { host: new URL(site.origin).host },
            signal: AbortSignal.timeout(10_000),
        });
        expect(disabled.status).toBe(404);
        await disabled.body?.cancel();
    }
    const active = await fetch(`${control.origin}/.cms/setup`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    });
    expect(active.status).toBe(200);
    await active.body?.cancel();
}
