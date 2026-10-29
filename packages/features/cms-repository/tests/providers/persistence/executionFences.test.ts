import { expect, test } from "bun:test";
import { executionFixture } from "./executionFixture";

test.each(["grant", "installation"] as const)(
    "cold payload reads reject a superseded %s while another payload loads",
    async (changed) => {
        const f = await executionFixture();
        if (changed === "grant") {
            f.model.beforeInstallationPayload = async () => {
                f.model.selection = {
                    ...f.model.selection!,
                    revision: 2,
                    grants: { default: "allow-selected", denied: [{ contractId: "payment", capabilityId: "pay" }] },
                };
                f.model.beforeInstallationPayload = async () => {};
            };
        } else {
            f.model.beforeSelectionPayload = async () => {
                await Promise.resolve();
                f.model.installation = {
                    ...f.model.installation!,
                    revision: 2,
                    installation: { ...f.model.installation!.installation, status: "disabled" },
                };
                f.model.beforeSelectionPayload = async () => {};
            };
        }
        const state = await f.reader.read(f.siteId, [f.installationId]);
        if (changed === "grant") {
            expect(state.selections!.grants.denied).toHaveLength(1);
        } else {
            expect(state.installations[0]!.installation.status).toBe("disabled");
        }
    },
);

test("repeated changes during cold payload reads fail closed after one retry", async () => {
    const f = await executionFixture();
    f.model.beforeSelectionPayload = async () => {
        f.model.selection = { ...f.model.selection!, revision: f.model.selection!.revision + 1 };
    };
    await expect(f.reader.read(f.siteId, [f.installationId])).rejects.toThrow("changed while loading payloads");
    expect(f.model.commands).toBe(4);
});
