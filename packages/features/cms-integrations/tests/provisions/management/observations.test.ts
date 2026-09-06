import { expect, test } from "bun:test";
import {
    IntegrationManagementError,
    IntegrationRuntimeError,
    runIntegrationInstallation,
    assertSourceCanBeRemoved,
} from "@bernouy/cms-integrations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { definition, fixture, report } from "./fixture";
test("deleted selected keys remain diagnosable and replaceable while apply stays strict", async () => {
    const { service, installations } = await fixture(
        async (_installation, _fn, payload) => {
            if (payload.operation === "health") {
                expect(payload.secretValues).toEqual({});
                return { ...report(), status: "needs_configuration" };
            }
            if (payload.operation === "read-settings") {
                expect(payload.secretValues).toEqual({});
                return { values: { key: "${DELETED_KEY}" }, savedRevision: "1", appliedRevision: "1" };
            }
            expect(payload.secretValues.key).toBe("selected-private-value");
            return { values: { key: "${SELECTED_KEY}" }, savedRevision: "2", appliedRevision: "2" };
        },
        { syncRuntimeSecrets: async () => {} },
    );
    await installations.replace({
        ...(await installations.get(definition.kind))!,
        managementSecretRefs: { key: "${DELETED_KEY}" },
    });
    expect(await service.health(definition.kind)).toMatchObject({
        observation: "valid",
        report: { status: "needs_configuration" },
    });
    expect(await service.settings(definition.kind)).toMatchObject({ values: { key: "${DELETED_KEY}" } });
    await expect(service.action(definition.kind, "apply-settings")).rejects.toThrow("Granted secret is unavailable");
    expect(
        await service.saveSettings(definition.kind, { values: { key: "${SELECTED_KEY}" }, expectedRevision: "1" }),
    ).toMatchObject({ values: { key: "${SELECTED_KEY}" }, appliedRevision: "2" });
});
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

test("current declarations fence retired and malformed grants from settings, health, and actions", async () => {
    const { service, installations, secrets } = await fixture(async (_installation, _fn, payload, reader) => {
        expect(payload.secretValues).toEqual({ "accounts.2.credentials.key": "selected-private-value" });
        await expect(reader.get("OTHER_KEY")).rejects.toThrow("not granted");
        return payload.operation === "health" ? report() : { values: {} };
    });
    const installed = (await installations.get(definition.kind))!;
    installed.definitionSnapshot!.management!.settings!.fields = [
        {
            id: "accounts",
            path: "accounts",
            label: "Accounts",
            type: "reorderable-list",
            itemKey: "id",
            fields: [{ id: "key", path: "credentials.key", label: "Key", type: "secret-ref" }],
        },
    ];
    installed.managementSecretRefs = {
        key: "${OTHER_KEY}",
        "accounts.2.credentials.key": "${SELECTED_KEY}",
        "accounts.__proto__.credentials.key": "${OTHER_KEY}",
        "accounts.2.credentials.retired": "${OTHER_KEY}",
    };
    await installations.replace(installed);
    expect((await service.health(definition.kind)).observation).toBe("valid");
    await service.settings(definition.kind);
    await service.action(definition.kind, "retry");
    expect(await secrets.get("OTHER_KEY")).toBe("other-private-value");
});
