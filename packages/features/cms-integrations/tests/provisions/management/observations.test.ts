import { expect, test } from "bun:test";
import {
    IntegrationManagementError,
    IntegrationRuntimeError,
    runIntegrationInstallation,
    assertSourceCanBeRemoved,
} from "@bernouy/cms-integrations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { definition, fixture, report } from "./fixture";
test("failed settings save retains stale health evidence and a safe revision conflict", async () => {
    let fail = false;
    const { service } = await fixture(async (_installation, _fn, payload) => {
        if (payload.operation === "save-settings") {
            throw new IntegrationManagementError(
                "Revision changed; reload settings",
                409,
                "settings_revision_conflict",
            );
        }
        if (fail) {
            throw new IntegrationRuntimeError("provider denied", 401);
        }
        return report();
    });
    await service.health(definition.kind);
    await expect(service.saveSettings(definition.kind, { values: {} })).rejects.toMatchObject({
        status: 409,
        publicCode: "settings_revision_conflict",
        message: "Revision changed; reload settings",
    });
    fail = true;
    expect(await service.health(definition.kind)).toMatchObject({
        freshness: "stale",
        observation: "unreachable",
        reason: "unauthorized",
        httpStatus: 401,
        report: { status: "ready", configuration: { savedRevision: "1" } },
    });
});
test("successful non-object health response is invalid rather than unreachable", async () => {
    const { service } = await fixture(async () => []);
    expect(await service.health(definition.kind)).toMatchObject({
        observation: "invalid_report",
        reason: "invalid_report",
        report: null,
    });
});
test("leased settings mutation blocks rerun and source removal without invoking deployment", async () => {
    const { installations, secrets } = await fixture(async () => ({}));
    const current = (await installations.get(definition.kind))!;
    const installation = {
        ...current,
        managementLease: { id: "other-worker", expiresAt: new Date(Date.now() + 60000) },
        artifacts: [...current.artifacts, { type: "source" as const, id: "urn:managed", action: "created" as const }],
    };
    await installations.replace(installation);
    await expect(
        runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: new InMemorySourceRepository(), secrets },
            installations,
            integrationId: definition.kind,
        }),
    ).rejects.toThrow("management operation");
    expect(() => assertSourceCanBeRemoved("managed", [installation])).toThrow("management operation");
});
