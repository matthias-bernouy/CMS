import { expect, test } from "bun:test";
import { CustomProviderImport } from "cms-control/components/admin/Resources/Providers/Custom/CustomProviderImport";
import { ProviderManagement } from "cms-control/components/admin/Resources/Providers/Management/ProviderManagement";

test("custom provider URLs are downloaded in the browser before the manifest is imported", async () => {
    const originalFetch = globalThis.fetch;
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === "https://provider.example/definition.json") {
            return new Response('{"kind":"provider-manifest"}', { status: 200 });
        }
        return Response.json(
            {
                kind: "provider-manifest",
                id: "custom.provider",
                version: "1.0.0",
                digest: `sha256:${"a".repeat(64)}`,
            },
            { status: 201 },
        );
    }) as typeof fetch;
    try {
        const component = new CustomProviderImport();
        document.body.append(component);
        const url = component.shadowRoot!.querySelector('[name="manifestUrl"]') as HTMLElement & { value: string };
        url.value = "https://provider.example/definition.json";
        let imported = "";
        component.addEventListener("provider-manifest-imported", (event) => {
            imported = (event as CustomEvent<{ id: string }>).detail.id;
        });

        component.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
        await waitFor(() => imported !== "");

        expect(imported).toBe("custom.provider");
        expect(calls.map((call) => call.url)).toEqual([
            "https://provider.example/definition.json",
            "/api/provider-custom-import",
        ]);
        expect(calls[1]?.init?.body).toBe(JSON.stringify({ manifest: '{"kind":"provider-manifest"}' }));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("provider setup links stay optional and open outside the CMS", () => {
    const component = new ProviderManagement();
    document.body.append(component);

    component.open("custom.provider", "1.0.0", "https://api.provider.example", {
        setup: "https://provider.example/account/tokens",
    });

    const link = component.shadowRoot!.querySelector("[data-setup-link]") as HTMLAnchorElement;
    expect(link.hidden).toBe(false);
    expect(link.href).toBe("https://provider.example/account/tokens");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
});

test("provider reconnection sends the installation revision with the new token", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
            ticket: "preview-a",
            operation: "reconnect",
            providerName: "Ulvia provider",
            accountLabel: "Local development",
            accountId: "local-dev",
            endpoint: "http://127.0.0.1:5103",
            manifestVersion: "0.1.1",
            manifestDigest: `sha256:${"a".repeat(64)}`,
            contracts: [],
            check: "Connection checked.",
        });
    }) as typeof fetch;
    try {
        const component = new ProviderManagement();
        document.body.append(component);
        component.open("ulvia.official", "0.1.1", "http://127.0.0.1:5103", undefined, {
            installationId: "installation-a",
            revision: 7,
        });
        (component.shadowRoot!.querySelector('[name="token"]') as HTMLElement & { value: string }).value =
            "provider-token-at-least-twenty";
        component.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
        await waitFor(() => bodies.length === 1);

        expect(component.shadowRoot!.querySelector("[data-title]")?.textContent).toBe("Reconnect provider");
        expect(bodies[0]).toMatchObject({ installationId: "installation-a", revision: 7 });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
