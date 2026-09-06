import { afterEach, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { renderCollectionSettings } from "cms-control/components/admin/Resources/Integrations/management/collections";
import { integrationRouteUrl } from "cms-control/components/admin/Resources/Integrations/api";
import "cms-control/components/admin/Resources/Integrations/management/IntegrationManagement";
import { detail, flush } from "./support";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

function collectionDefinition() {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "design",
        label: "Design",
        version: "1.0.0",
        inputs: [],
        resourceCategories: [{ id: "content", label: "Content" }],
        resources: [
            { id: "design/blocs/one", type: "bloc", artifact: "design-one", category: "content" },
            { id: "design/blocs/two", type: "bloc", artifact: "design-two", category: "content" },
        ],
        artifacts: [
            { type: "bloc", bloc: { tag: "design-one", name: "One", compositionHTML: "<p>One</p>" } },
            { type: "bloc", bloc: { tag: "design-two", name: "Two", compositionHTML: "<p>Two</p>" } },
        ],
    });
}

test("collection activation preserves installed inactive blocs and submits only resource ids", async () => {
    const definition = collectionDefinition();
    const requests: unknown[] = [];
    globalThis.fetch = (async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({});
    }) as typeof fetch;
    const root = document.createElement("div");
    document.body.append(root);
    let message = "";
    renderCollectionSettings(
        root,
        { ...detail(), id: "design", integrationType: "collection", definition, activeResources: ["design/blocs/one"] },
        (next) => {
            message = next;
        },
    );
    const inputs = root.querySelectorAll<HTMLInputElement>("[data-collection-resource]");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.checked).toBe(true);
    expect(inputs[1]?.checked).toBe(false);
    expect(root.textContent).toContain("Existing pages keep rendering");
    inputs[0]!.checked = false;
    inputs[1]!.checked = true;
    root.querySelector("button")!.click();
    await flush();
    expect(requests).toEqual([
        { url: "/api/integrations/installations/rerun?id=design", body: { resources: ["design/blocs/two"] } },
    ]);
    expect(message).toBe("Active blocs saved.");
});

test.each([false, true])("collection feedback survives a delayed=%s bound view replacement", async (delayed) => {
    let activeResources = ["design/blocs/one"];
    globalThis.fetch = (async (input, init) => {
        if (init?.method === "POST") {
            activeResources = JSON.parse(String(init.body)).resources;
            return Response.json({});
        }
        const id = new URL(String(input), "https://cms.test").searchParams.get("id")!;
        return Response.json({
            ...detail(),
            id,
            integrationType: "collection",
            definition: collectionDefinition(),
            activeResources,
        });
    }) as typeof fetch;
    const workspace = document.createElement("section");
    document.body.append(workspace);
    const mount = (id = "design") => {
        const view = document.createElement("cms-integration-management");
        view.setAttribute("installation-id", id);
        workspace.replaceChildren(view);
        return view;
    };
    const original = mount();
    await flush();
    original.querySelector<HTMLInputElement>("[data-collection-resource]")!.checked = false;
    document.addEventListener(
        "integration:updated",
        () => {
            if (delayed) {
                setTimeout(() => mount(), 0);
            } else {
                mount();
            }
        },
        { once: true },
    );
    original.querySelector<HTMLButtonElement>("[data-management-content] button")!.click();
    expect(original.textContent).toContain("Saving active blocs…");
    await flush();
    await flush();
    await flush();
    expect(original.isConnected).toBe(false);
    expect(activeResources).toEqual([]);
    expect(workspace.querySelector("[data-management-status]")?.textContent).toBe("Active blocs saved.");
    expect(workspace.querySelector<HTMLInputElement>("[data-collection-resource]")?.checked).toBe(false);
    mount("other-installation");
    await flush();
    expect(workspace.querySelector("[data-management-status]")?.textContent).toBe("");
});

test("collection routes stay under Blocs", () => {
    history.replaceState(null, "", "/admin/blocs");
    expect(integrationRouteUrl({ view: "list", tab: "catalogue" })).toBe("/admin/blocs?tab=catalogue");
    expect(integrationRouteUrl({ view: "installation", id: "design" })).toBe("/admin/blocs?integration=design");
});
