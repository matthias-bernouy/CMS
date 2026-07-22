import { describe, expect, test } from "bun:test";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { definition, functionDefinition } from "./cleanupDefinitions";
import { install, rerun } from "./cleanupSupport";

describe("@bernouy/cms-integrations obsolete artifact cleanup", () => {
    test("deletes source and function artifacts removed by a successful rerun", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = definition("cleanup", "1.0.0", true);
        const current = definition("cleanup", "2.0.0", false);

        await install(previous, { sources, functions, secrets, installations });
        const result = await rerun(current, { sources, functions, secrets, installations });

        expect(await sources.getSource("urn:legacy-source")).toBeNull();
        expect(await functions.getFunction("legacyFunction")).toBeNull();
        expect(result.installation.artifacts).toEqual([]);
        expect(result.installation.status).toBe("success");
    });

    test("keeps an obsolete artifact still tracked by another installation", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const first = functionDefinition("first", "1.0.0", true);
        const second = functionDefinition("second", "1.0.0", true);

        await install(first, { sources, functions, secrets, installations });
        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, functions, secrets },
            installations,
            siteIntegrations: [second],
            dto: { kind: second.kind, answers: {}, options: { force: true } },
        });
        await rerun(functionDefinition("first", "2.0.0", false), {
            sources,
            functions,
            secrets,
            installations,
        });

        expect(await functions.getFunction("legacyFunction")).not.toBeNull();
        expect((await installations.get("first"))?.artifacts).toEqual([]);
        expect((await installations.get("second"))?.artifacts).toEqual([
            { type: "function", id: "legacyFunction", action: "updated" },
        ]);
    });
});
