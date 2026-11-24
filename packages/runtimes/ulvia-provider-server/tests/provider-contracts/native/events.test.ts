import { expect, test } from "bun:test";
import { EventsError } from "@bernouy/cms-events";
import { eventSourceReader } from "../../../src/runtime/recovery/events/reader";

const context = { siteId: "site", providerId: "provider", connectionId: "receiver", contractVersion: "1.0.0" };
function fixture() {
    const lookups: { namespace: string; installationId?: string }[] = [];
    let administrator = true;
    const reader = eventSourceReader({
        siteId: "site",
        provider: (context) => {
            if (!context.sourceInstallationId || context.subjectId || context.systemServiceId) {
                throw new EventsError("FORBIDDEN");
            }
            return context.sourceInstallationId;
        },
        administrator: async () => {
            if (!administrator) {
                throw new EventsError("FORBIDDEN");
            }
            return "admin";
        },
        installation: async (namespace, installationId) => {
            lookups.push({ namespace, ...(installationId ? { installationId } : {}) });
            const selected = namespace === "test/foreign" ? "foreign" : "own";
            if (installationId && selected !== installationId) {
                throw new EventsError("FORBIDDEN");
            }
            return selected;
        },
    });
    return {
        reader,
        lookups,
        revoke: () => {
            administrator = false;
        },
    };
}
test("administrator source discovery honors its contract filter with an exact installation scope", async () => {
    const f = fixture();
    const admin = { ...context, subjectId: "admin" };
    expect(await f.reader(admin)).toBeNull();
    expect(await f.reader(admin, "test/foreign")).toEqual({
        siteId: "site",
        installationId: "foreign",
        namespace: "test/foreign",
    });
    f.revoke();
    await expect(f.reader(admin, "test/foreign")).rejects.toHaveProperty("code", "FORBIDDEN");
    expect(f.lookups).toHaveLength(1);
});
test("Provider source readers retain their installation scope and cannot filter into another installation", async () => {
    const f = fixture();
    const provider = { ...context, sourceInstallationId: "own" };
    expect(await f.reader(provider)).toEqual({ siteId: "site", installationId: "own" });
    expect(await f.reader(provider, "test/own")).toEqual({
        siteId: "site",
        installationId: "own",
        namespace: "test/own",
    });
    await expect(f.reader(provider, "test/foreign")).rejects.toHaveProperty("code", "FORBIDDEN");
    await expect(f.reader({ ...provider, subjectId: "forged" })).rejects.toHaveProperty("code", "FORBIDDEN");
    await expect(f.reader({ ...context, systemServiceId: "forged" })).rejects.toHaveProperty("code", "FORBIDDEN");
    expect(f.lookups).toEqual([
        { namespace: "test/own", installationId: "own" },
        { namespace: "test/foreign", installationId: "own" },
    ]);
});
