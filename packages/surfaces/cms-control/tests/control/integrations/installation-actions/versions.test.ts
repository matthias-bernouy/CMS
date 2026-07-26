import { describe, expect, test } from "bun:test";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import getIntegrationInstallationVersions from "cms-control/api/_platform/integrations/installations/versions.get";
import { createInstallation, makeCms } from "../support/helpers";

const INDEX: IntegrationDefinitionIndex = {
    kind: "test-secret-source",
    label: "Test secret source",
    stable: "1.1.0",
    latest: "2.0.0-beta.1",
    versions: [
        { version: "1.0.0", path: "versions/1.0.0", definition: "definition.json" },
        { version: "1.1.0", path: "versions/1.1.0", definition: "definition.json" },
        { version: "2.0.0-beta.1", path: "versions/2.0.0-beta.1", definition: "definition.json" },
    ],
};

describe("GET integration installation versions", () => {
    test("returns channel and exact-version choices without repository paths", async () => {
        const { cms, integrationInstallations, integrationCatalog } = makeCms();
        await createInstallation(integrationInstallations, "test-secret-source");
        integrationCatalog.getIndex = async () => INDEX;

        const response = await getIntegrationInstallationVersions(
            new Request("http://control.test/api/integrations/installations/versions?id=test-secret-source"),
            cms,
        );
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(JSON.parse(text)).toEqual({
            id: "test-secret-source",
            current: "1.0.0",
            stable: "1.1.0",
            latest: "2.0.0-beta.1",
            versions: ["1.1.0", "2.0.0-beta.1"],
        });
        expect(text).not.toContain("versions/1.0.0");
        expect(text).not.toContain("definition.json");
    });

    test("omits installed and older versions from the upgrade choices", async () => {
        const { cms, integrationInstallations, integrationCatalog } = makeCms();
        await createInstallation(integrationInstallations, "test-secret-source");
        const installation = await integrationInstallations.get("test-secret-source");
        await integrationInstallations.replace({ ...installation!, definitionVersion: "1.1.0" });
        integrationCatalog.getIndex = async () => INDEX;

        const response = await getIntegrationInstallationVersions(
            new Request("http://control.test/api/integrations/installations/versions?id=test-secret-source"),
            cms,
        );

        expect(await response.json()).toEqual({
            id: "test-secret-source",
            current: "1.1.0",
            latest: "2.0.0-beta.1",
            versions: ["2.0.0-beta.1"],
        });
    });

    test("distinguishes missing installations and unavailable repository history", async () => {
        const { cms, integrationInstallations } = makeCms();
        const missing = await getIntegrationInstallationVersions(
            new Request("http://control.test/api/integrations/installations/versions?id=missing"),
            cms,
        );
        expect(missing.status).toBe(404);
        expect(await missing.json()).toMatchObject({ code: "integration_installation_not_found" });

        await createInstallation(integrationInstallations, "test-secret-source");
        const unavailable = await getIntegrationInstallationVersions(
            new Request("http://control.test/api/integrations/installations/versions?id=test-secret-source"),
            cms,
        );
        expect(unavailable.status).toBe(404);
        expect(await unavailable.json()).toMatchObject({ code: "integration_versions_not_found" });
    });

    test("requires an installation identifier", async () => {
        const { cms } = makeCms();
        await expect(
            getIntegrationInstallationVersions(
                new Request("http://control.test/api/integrations/installations/versions"),
                cms,
            ),
        ).rejects.toThrow(/id/);
    });
});
