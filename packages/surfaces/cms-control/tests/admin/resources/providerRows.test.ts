import { expect, test } from "bun:test";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import {
    renderProviderConnections,
    renderProviderManifests,
} from "cms-control/components/admin/Resources/Providers/rows";
import { renderCustomProviders } from "cms-control/components/admin/Resources/Providers/Custom/rows";

const manifest = (version: string, digest: string): RepositoryArtifactEntry => ({
    repositoryId: "local",
    kind: "provider-manifest",
    publisherId: "ulvia",
    id: "ulvia.official",
    version,
    digest,
    name: "Ulvia Official Provider",
    description: "Official local provider",
});

test("provider connections render as navigation rows", () => {
    window.history.replaceState(null, "", "/admin/settings/providers");
    const list = document.createElement("p9r-navigation-list");

    renderProviderConnections(
        list,
        [
            {
                id: "connection-1",
                providerId: "ulvia.official",
                accountId: "local-dev",
                endpoint: "http://127.0.0.1:5103",
                status: "enabled",
                manifestVersion: "1.0.0",
                revision: 1,
                observedAt: null,
                contracts: [],
            },
        ],
        [manifest("1.0.0", "sha256:one")],
    );

    const row = list.querySelector("p9r-navigation-list-item")!;
    expect(row.getAttribute("href")).toBe("/admin/settings/providers?provider=connection-1");
    expect(row.querySelector('[slot="title"]')?.textContent).toBe("Ulvia Official Provider");
    expect(row.querySelector('[slot="description"]')?.textContent).toContain("local-dev");
    expect(row.querySelector('[slot="badge"]')?.textContent).toBe("Enabled");
});

test("available providers exclude connected providers", () => {
    const list = document.createElement("p9r-navigation-list");
    const imported = {
        kind: "provider-manifest",
        id: "ulvia.official",
        version: "1.1.0",
        digest: "sha256:two",
    };

    const count = renderProviderManifests(
        list,
        {
            repositories: ["local"],
            available: [manifest("1.1.0", "sha256:two")],
            imported: [imported],
        },
        [
            {
                id: "connection-1",
                providerId: "ulvia.official",
                accountId: "local-dev",
                endpoint: "http://127.0.0.1:5103",
                status: "enabled",
                manifestVersion: "1.1.0",
                revision: 1,
                observedAt: null,
                contracts: [],
            },
        ],
        () => undefined,
    );

    expect(count).toBe(0);
    expect(list.children).toHaveLength(0);
});

test("available providers keep only the latest release and expose the connection action", () => {
    const list = document.createElement("p9r-navigation-list");
    const selected: string[] = [];
    const imported = {
        kind: "provider-manifest",
        id: "ulvia.official",
        version: "1.1.0",
        digest: "sha256:two",
    };

    const count = renderProviderManifests(
        list,
        {
            repositories: ["local"],
            available: [manifest("1.0.0", "sha256:one"), manifest("1.1.0", "sha256:two")],
            imported: [imported],
        },
        [],
        (entry) => selected.push(entry.version),
    );

    const row = list.querySelector<HTMLElement>("p9r-navigation-list-item")!;
    expect(count).toBe(1);
    expect(list.children).toHaveLength(1);
    expect(row.querySelector('[slot="badge"]')?.textContent).toBe("Connect");
    row.click();
    expect(selected).toEqual(["1.1.0"]);
});

test("custom providers remain connectable when no repository lists their manifest", () => {
    const list = document.createElement("p9r-navigation-list");
    const selected: string[] = [];
    const count = renderCustomProviders(
        list,
        {
            repositories: ["local"],
            available: [manifest("1.0.0", "sha256:one")],
            imported: [
                {
                    kind: "provider-manifest",
                    id: "custom.provider",
                    publisherId: "custom.publisher",
                    name: "Custom Provider",
                    version: "1.0.0",
                    digest: "sha256:custom",
                    defaultOrigin: "https://api.provider.example",
                },
            ],
        },
        [],
        (provider) => selected.push(provider.id),
    );

    expect(count).toBe(1);
    expect(list.querySelector('[slot="title"]')?.textContent).toBe("Custom Provider");
    list.querySelector<HTMLElement>("p9r-navigation-list-item")!.click();
    expect(selected).toEqual(["custom.provider"]);
});
