import { expect, test } from "bun:test";
import type { ControlCms } from "cms-control/ControlCms";
import updateProviderStatus from "cms-control/api/_integrations/provider-status.post";

test("provider lifecycle actions use the administrator-scoped management boundary", async () => {
    let received: unknown;
    const cms = {
        auth: { getSubject: async () => ({ identifier: "admin" }) },
        config: {
            administrator: async () => true,
            providerResources: {
                isAdministrator: async () => true,
                sources: [],
                management: {
                    setStatus: async (input: unknown) => {
                        received = input;
                        return { status: "disabled" };
                    },
                },
            },
        },
    } as unknown as ControlCms;
    const response = await updateProviderStatus(
        new Request("http://control.test/api/provider-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId: "provider-1", revision: 4, action: "disable" }),
        }),
        cms,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({ installationId: "provider-1", revision: 4, action: "disable" });
});

test("provider lifecycle actions reject unknown operations", async () => {
    const cms = {
        auth: { getSubject: async () => ({ identifier: "admin" }) },
        config: {
            administrator: async () => true,
            providerResources: {
                isAdministrator: async () => true,
                sources: [],
                management: { setStatus: async () => ({}) },
            },
        },
    } as unknown as ControlCms;
    const request = new Request("http://control.test/api/provider-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: "provider-1", revision: 4, action: "delete" }),
    });

    await expect(updateProviderStatus(request, cms)).rejects.toThrow("lifecycle action expected");
});
