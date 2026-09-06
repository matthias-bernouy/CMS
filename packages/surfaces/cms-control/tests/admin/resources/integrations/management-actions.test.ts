import { afterEach, expect, test } from "bun:test";
import { executeEndpointAction } from "cms-control/components/admin/Resources/Dashboards/runtime/actions/endpoint";
const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

test("dashboard page publication calls the owned action with its resolved form values", async () => {
    const requests: unknown[] = [];
    globalThis.fetch = (async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({ values: { revision: "published", page: "/terms" } });
    }) as typeof fetch;
    const result = await executeEndpointAction(
        {} as never,
        [],
        {
            id: "publish",
            label: "Publish",
            management: {
                installationId: "provider",
                action: "action",
                actionId: "publish-terms",
                body: { page: "$field.page", expectedVersion: "$resource.revision" },
            },
        },
        { fields: { page: "/terms" }, resource: { revision: "previous" } },
    );
    expect(requests).toEqual([
        {
            url: "/api/integrations/management/action?id=provider",
            body: { actionId: "publish-terms", input: { page: "/terms", expectedVersion: "previous" } },
        },
    ]);
    expect(result).toMatchObject({ kind: "value", value: { revision: "published", page: "/terms" } });
});
