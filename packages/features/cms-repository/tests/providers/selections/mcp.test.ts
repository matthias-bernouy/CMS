import { expect, test } from "bun:test";
import { planContractSelections } from "@bernouy/cms-repository/providers/selections";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { installationFor, siteId } from "./fixtures";
import { contractDocument, implementation, releaseCatalogue } from "../support/fixtures";

test("remote site selection requires HTTP beside MCP while contract admission still permits local MCP-only execution", async () => {
    for (const http of [false, true]) {
        const document = contractDocument("remote.example", "invoke");
        const capability = (document.capabilities as Record<string, unknown>[])[0]!;
        capability.bindings = [
            ...(http ? [{ id: "http", ...(capability.binding as object) }] : []),
            { id: "mcp", transport: "mcp" },
        ];
        delete capability.binding;
        const releases = await releaseCatalogue(document);
        const record = (await releases.get("remote.example", "1.0.0"))!;
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const installation = await installationFor(releases, manifests, [
            implementation("remote.example", "1.0.0", record.admission.digest),
        ]);
        const selection = {
            siteId,
            installationId: installation.id,
            contractId: "remote.example",
            version: "1.0.0",
            digest: record.admission.digest,
        };
        const result = planContractSelections(siteId, [selection], {
            releases,
            manifests,
            installations: [installation],
        });
        if (http) {
            expect((await result).structurallyValid).toBe(true);
        } else {
            await expect(result).rejects.toThrow("outbound HTTP binding");
        }
    }
});
