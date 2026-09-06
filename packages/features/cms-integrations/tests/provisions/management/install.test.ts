import { expect, test } from "bun:test";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { definition } from "./fixture";

test("install needs no answers and rerun/upgrade preserve configured generated secret values", async () => {
    const installations = new InMemoryIntegrationInstallationRepository();
    const secrets = new InMemorySecretStore();
    const deps = {
        sources: new InMemorySourceRepository(),
        functions: new InMemoryFunctionRepository(),
        secrets,
        installations,
    };
    const created = await runIntegrationInstallation({
        mode: "create",
        deps,
        installations,
        dto: { kind: definition.kind, answers: {}, options: {} },
        siteIntegrations: [definition],
    });
    expect(created.installation.status).toBe("success");
    await secrets.set("MANAGED_SIGNING", "applied-signing-value");
    await runIntegrationInstallation({ mode: "rerun", deps, installations, integrationId: definition.kind, body: {} });
    expect(await secrets.get("MANAGED_SIGNING")).toBe("applied-signing-value");
    await runIntegrationInstallation({
        mode: "upgrade",
        deps,
        installations,
        integrationId: definition.kind,
        targetDefinition: { ...definition, version: "1.1.0" },
    });
    expect(await secrets.get("MANAGED_SIGNING")).toBe("applied-signing-value");
});

test("undeclared answers cannot reach installation persistence", async () => {
    const installations = new InMemoryIntegrationInstallationRepository();
    const secrets = new InMemorySecretStore();
    const deps = {
        sources: new InMemorySourceRepository(),
        functions: new InMemoryFunctionRepository(),
        secrets,
        installations,
    };
    await expect(
        runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            dto: { kind: definition.kind, answers: { privateKey: "raw-value-must-not-persist" }, options: {} },
            siteIntegrations: [definition],
        }),
    ).rejects.toThrow("undeclared installation inputs");
    expect(await installations.list()).toEqual([]);
    expect(await secrets.listKeys()).toEqual([]);
});
