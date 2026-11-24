import { expect, spyOn, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { ProviderConnectionWorkflow } from "repository/providers/management/ProviderConnectionWorkflow";
import { type PendingProviderConnection } from "repository/providers/management/connectionTypes";
import { type ProviderConnectionDraftStore } from "repository/providers/management/connectionDrafts";
import { providerSite, report, siteId } from "./fixtures";

async function fixture() {
    const site = await providerSite();
    let now = Date.now();
    let currentReport = report(site.previous);
    const values = new Map<string, PendingProviderConnection>();
    const drafts: ProviderConnectionDraftStore = {
        get: async (id) => {
            const value = values.get(id);
            return value ? structuredClone(value) : undefined;
        },
        set: async (id, value) => {
            values.set(id, structuredClone(value));
        },
        delete: async (id) => {
            values.delete(id);
        },
    };
    const secrets = new InMemorySecretStore();
    const gateway = { siteId, ...site };
    const create = () =>
        new ProviderConnectionWorkflow(gateway, secrets, {
            lifecycle: site.lifecycle,
            drafts,
            now: () => now,
            readReport: async () => currentReport,
        });
    const input = {
        providerId: site.previous.manifest.providerId,
        version: "1.0.0",
        endpoint: "https://provider.example.com",
        token: "valid-provider-secret-for-preview",
    };
    return {
        site,
        create,
        input,
        changeReport: () => {
            currentReport = { ...currentReport, instanceId: "example--other--instance" };
        },
        setAvailability: (status: "ready" | "unavailable") => {
            currentReport = {
                ...currentReport,
                implementations: currentReport.implementations.map((item) => ({ ...item, status })),
            };
        },
        expire: () => {
            now += 300_001;
        },
    };
}

test("an encrypted-port draft survives workflow restart and cannot be consumed by another administrator", async () => {
    const f = await fixture();
    const preview = await f.create().preview(f.input, "admin-a");
    expect(preview.requests).toContainEqual({
        contractId: "ulvia/payment",
        capabilityId: "create-link",
        versionRange: "^1.0.0",
        optional: false,
    });
    expect(JSON.stringify(preview)).not.toContain(f.input.token);
    await expect(f.create().approve(preview.ticket, "admin-b")).rejects.toThrow("another administrator");
    const approved = await f.create().approve(preview.ticket, "admin-a");
    expect(approved.observed).toBe(true);
    const first = await f.site.installations.get({ siteId, installationId: approved.installationId });
    expect(await f.create().approve(preview.ticket, "admin-a")).toEqual(approved);
    expect((await f.site.installations.get({ siteId, installationId: approved.installationId }))?.revision).toBe(
        first!.revision,
    );
    await f.site.lifecycle.revoke({ siteId, installationId: approved.installationId }, first!.revision);
    await expect(f.create().approve(preview.ticket, "admin-a")).rejects.toThrow("revoked");
});

test("approval rejects an expired ticket or a remote identity changed after preview", async () => {
    const f = await fixture();
    const preview = await f.create().preview(f.input, "admin-a");
    f.changeReport();
    await expect(f.create().approve(preview.ticket, "admin-a")).rejects.toThrow("changed after");
    expect(await f.site.installations.list(siteId)).toEqual([]);
    f.expire();
    await expect(f.create().approve(preview.ticket, "admin-a")).rejects.toThrow("expired");
});

test.each(["connect", "reconnect"] as const)("%s persists the approval-time availability", async (operation) => {
    const f = await fixture();
    let input = { ...f.input } as typeof f.input & { installationId?: string; revision?: number };
    if (operation === "reconnect") {
        const initial = await f.create().preview(input, "admin-a");
        const approved = await f.create().approve(initial.ticket, "admin-a");
        const current = await f.site.installations.get({ siteId, installationId: approved.installationId });
        input = { ...input, installationId: approved.installationId, revision: current!.revision };
    }
    const preview = await f.create().preview(input, "admin-a");
    expect(preview.contracts.every((item) => item.status === "ready")).toBe(true);
    f.setAvailability("unavailable");
    const approved = await f.create().approve(preview.ticket, "admin-a");
    expect(approved.observed).toBe(true);
    const current = await f.site.installations.get({ siteId, installationId: approved.installationId });
    expect(current!.observation!.report.implementations.map((item) => item.status)).toEqual([
        "unavailable",
        "unavailable",
    ]);
});

test("retrying an approval after an observation failure probes current readiness again", async () => {
    const f = await fixture();
    const preview = await f.create().preview(f.input, "admin-a");
    const observe = spyOn(f.site.lifecycle, "observe").mockRejectedValueOnce(
        new Error("Temporary observation failure"),
    );
    try {
        expect((await f.create().approve(preview.ticket, "admin-a")).observed).toBe(false);
    } finally {
        observe.mockRestore();
    }
    f.setAvailability("unavailable");
    const approved = await f.create().approve(preview.ticket, "admin-a");
    const current = await f.site.installations.get({ siteId, installationId: approved.installationId });
    expect(approved.observed).toBe(true);
    expect(current!.observation!.report.implementations.every((item) => item.status === "unavailable")).toBe(true);
});

test.each(["enabled", "disabled", "revoked", "reconnected"] as const)(
    "concurrent observation is reconciled only for the unchanged %s approval",
    async (status) => {
        const f = await fixture();
        const preview = await f.create().preview(f.input, "admin-a");
        const original = f.site.lifecycle.observe.bind(f.site.lifecycle);
        const observe = spyOn(f.site.lifecycle, "observe").mockImplementationOnce(async (scope, revision, report) => {
            const stored = await original(scope, revision, report);
            if (status === "disabled" || status === "revoked") {
                await f.site.installations.setStatus(scope, stored.revision, status);
            } else if (status === "reconnected") {
                const replacement = await f.create().preview(
                    {
                        ...f.input,
                        installationId: scope.installationId,
                        revision: stored.revision,
                        token: "different-provider-credential",
                    },
                    "admin-a",
                );
                await f.create().approve(replacement.ticket, "admin-a");
            }
            return original(scope, revision, report);
        });
        try {
            const result = await f.create().approve(preview.ticket, "admin-a");
            expect(result.observed).toBe(status === "enabled");
            const current = await f.site.installations.get({ siteId, installationId: result.installationId });
            expect(current!.installation.status).toBe(status === "reconnected" ? "enabled" : status);
            if (status === "enabled" || status === "reconnected") {
                expect(current!.observation).toBeDefined();
            }
        } finally {
            observe.mockRestore();
        }
    },
);
