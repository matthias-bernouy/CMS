import { expect } from "bun:test";
import type { UpgradeFixture } from "../fixture";
/** Author the error Page through the historical release, rather than injecting current storage documents. */
export async function seedPresentation(call: (path: string, method: string, input?: unknown) => Promise<Response>) {
    const invoke = async (path: string, method: string, input?: unknown) => {
        const response = await call(path, method, input);
        expect(response.ok, await response.clone().text()).toBe(true);
        return response.json();
    };
    const draft = await invoke("/pages/create", "POST", {
        path: "/upgrade-error",
        title: "Our historical maintenance design",
        content: "",
    });
    await invoke("/pages/publish", "POST", { id: draft.id, expectedRevision: draft.revision, visible: true });
    const settings = await invoke("/site", "GET");
    await invoke("/site", "POST", {
        expectedRevision: settings.revision,
        visible: true,
        serverError: { pageId: draft.id },
    });
}
export async function verifyPresentation(f: UpgradeFixture) {
    const response = await fetch(`${f.origin}/any/path?ignored=secret`, { signal: AbortSignal.timeout(2000) });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    const html = await response.text();
    expect(html).toContain("Our historical maintenance design");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("ignored=secret");
    const assets = [...html.matchAll(/(?:href|src)="(\/_content\/maintenance\/[a-f0-9]{64}\/\d+)"/gu)].map(
        (match) => match[1]!,
    );
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
        const resource = await fetch(`${f.origin}${asset}`, { signal: AbortSignal.timeout(2000) });
        expect(resource.status).toBe(200);
        await resource.body?.cancel();
    }
}
