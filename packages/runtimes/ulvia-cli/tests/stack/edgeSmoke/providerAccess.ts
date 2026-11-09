import { expect } from "bun:test";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import type { HostedSite } from "./setup";

export async function verifySecondInstanceIsolation(primary: HostedSite, secondary: HostedSite) {
    const a = repositoryApi(primary.origin);
    const b = repositoryApi(secondary.origin);
    const owner = await a.session(primary.administrator.email, primary.administrator.password);
    const foreign = await b.session(secondary.administrator.email, secondary.administrator.password);
    const primaryPages = await a.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, owner);
    expect(primaryPages.status).toBe(200);
    const pages = (await primaryPages.json()).items;
    expect(pages).toHaveLength(1);
    const foreignRead = await b.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pages[0].id }, foreign);
    expect(foreignRead.status).toBe(404);
    await foreignRead.body?.cancel();
    const crossCookie = await b.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, owner);
    expect([401, 403]).toContain(crossCookie.status);
    await crossCookie.body?.cancel();
    const hosting = await a.request(
        "ulvia/cms.hosting",
        "/hosting/instances.list",
        "QUERY",
        { after: null, limit: 25 },
        owner,
    );
    expect([401, 403, 404]).toContain(hosting.status);
    await hosting.body?.cancel();
    const secondaryPages = await b.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, foreign);
    expect(secondaryPages.status).toBe(200);
    expect((await secondaryPages.json()).items).toEqual([]);
}
