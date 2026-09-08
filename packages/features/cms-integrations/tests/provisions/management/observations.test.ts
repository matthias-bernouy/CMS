import { endpointFixture } from "./support/endpoint";
import { expect, test } from "bun:test";
import {
    IntegrationRuntimeError,
    runIntegrationInstallation,
    assertSourceCanBeRemoved,
} from "@bernouy/cms-integrations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { definition, fixture, report } from "./support/fixture";
test("deleted selected keys remain diagnosable and replaceable while writes stay strict", async () => {
    const { service, installations, write, deps } = await endpointFixture(({ _cms }) => {
        expect(_cms.secretValues.key).toBe("selected-private-value");
        return { savedRevision: "2" };
    });
    deps.invoke = async (_installation, _fn, payload) => {
        expect(payload.secretValues).toEqual({});
        return { ...report(), status: "needs_configuration" };
    };
    await installations.replace({
        ...(await installations.get(definition.kind))!,
        managementSecretRefs: { key: "${DELETED_KEY}" },
    });
    expect(await service.health(definition.kind)).toMatchObject({
        observation: "valid",
        report: { status: "needs_configuration" },
    });
    await expect(write({ values: {} })).rejects.toThrow("Granted secret is unavailable");
    expect((await write({ values: { key: "${SELECTED_KEY}" } })).body).toEqual({ savedRevision: "2" });
});
test("failed source save invalidates cached health without losing stale evidence or conflict details", async () => {
    let fail = false;
    const { service, write, deps } = await endpointFixture(() =>
        Response.json({ error: "Revision changed; reload", code: "revision_conflict" }, { status: 409 }),
    );
    deps.invoke = async () => {
        if (fail) {
            throw new IntegrationRuntimeError("provider denied", 401);
        }
        return report();
    };
    await service.health(definition.kind);
    expect(await write({ values: {} })).toEqual({
        status: 409,
        body: { error: "Revision changed; reload", code: "revision_conflict" },
    });
    fail = true;
    expect(await service.health(definition.kind)).toMatchObject({
        freshness: "stale",
        observation: "unreachable",
        reason: "unauthorized",
        httpStatus: 401,
        report: { status: "ready" },
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
    const view = installed.definitionSnapshot!.artifacts!.find((artifact) => artifact.type === "dashboard-view")!;
    if (view.type !== "dashboard-view" || view.view.view.widgets[0]!.widget !== "w-detail") {
        throw new Error("Missing detail");
    }
    const detail = view.view.view.widgets[0]!;
    detail.main = [
        {
            id: "keys",
            title: "Keys",
            fields: [
                {
                    id: "accounts",
                    path: "accounts",
                    label: "Accounts",
                    type: "reorderable-list",
                    itemKey: "id",
                    fields: [{ id: "key", path: "credentials.key", label: "Key", type: "secret-ref" }],
                },
            ],
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
    await service.action(definition.kind, "retry");
    expect(await secrets.get("OTHER_KEY")).toBe("other-private-value");
});
