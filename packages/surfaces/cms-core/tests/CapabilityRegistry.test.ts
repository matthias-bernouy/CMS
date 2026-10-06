import { expect, test } from "bun:test";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { DefaultCoreCapabilityDispatcher } from "../src";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "site-a",
    installationId: "install-a",
    origin: "control" as const,
    actorKind: "administrator" as const,
};

test("the Core dispatcher seals an exact capability matrix", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    dispatcher.register("ulvia.cms.settings", "get", async (input) => ({ siteId: input.siteId }));
    dispatcher.seal([contract("ulvia.cms.settings", ["get"])]);

    await expect(dispatcher.invoke("ulvia.cms.settings", "get", { siteId: "site-a" }, context)).resolves.toEqual({
        siteId: "site-a",
    });
    await expect(dispatcher.invoke("ulvia.cms.settings", "missing", {}, context)).rejects.toEqual(
        expect.objectContaining({
            code: "CAPABILITY_NOT_FOUND",
            status: 404,
        }),
    );
    expect(() => dispatcher.register("ulvia.cms.settings", "set", async () => ({}))).toThrow("already sealed");
});

test("the Core dispatcher rejects missing, unexpected and duplicate handlers", () => {
    const missing = new DefaultCoreCapabilityDispatcher();
    expect(() => missing.seal([contract("ulvia.cms.settings", ["get"])])).toThrow("missing: ulvia.cms.settings/get");

    const unexpected = new DefaultCoreCapabilityDispatcher();
    unexpected.register("ulvia.cms.settings", "set", async () => ({}));
    expect(() => unexpected.seal([contract("ulvia.cms.settings", ["get"])])).toThrow(
        "unexpected: ulvia.cms.settings/set",
    );

    const duplicate = new DefaultCoreCapabilityDispatcher();
    duplicate.register("ulvia.cms.settings", "get", async () => ({}));
    expect(() => duplicate.register("ulvia.cms.settings", "get", async () => ({}))).toThrow("already registered");
});

function contract(contractId: string, capabilityIds: readonly string[]): ContractRelease {
    return {
        contractId,
        capabilities: capabilityIds.map((id) => ({ id })),
    } as unknown as ContractRelease;
}
