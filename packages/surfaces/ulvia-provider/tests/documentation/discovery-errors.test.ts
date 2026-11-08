import { mountInstallations } from "../execution/installations/mount";
import { expect, test } from "bun:test";
import { HttpRepositoryDiscovery } from "@bernouy/repository/repository/search/http";
import { RepositoryDiscovery } from "@bernouy/repository/repository/search";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { resolvedContract, invokeHttp } from "../execution/messages/fixtures";

test("repository HTTP refusals keep absence, integrity, input and infrastructure errors distinct", async () => {
    const contract = await resolvedContract("ulvia/cms.installations");
    const reference = {
        kind: "contract" as const,
        publisherId: contract.release.publisherId,
        id: contract.release.contractId,
        version: contract.release.version,
        digest: contract.digest,
    };
    for (const [code, status] of [
        ["NOT_FOUND", 404],
        ["RELEASE_MISMATCH", 409],
        ["REVISION_CONFLICT", 409],
        ["INVALID_INPUT", 422],
        ["CATALOGUE_TOO_LARGE", 422],
        ["CORE_UNAVAILABLE", 503],
    ] as const) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        const source = new HttpRepositoryDiscovery("configured", "https://repository.test", {
            request: async () => Response.json({ error: { code, message: "private upstream details" } }, { status }),
        });
        await mountInstallations(dispatcher, { discovery: new RepositoryDiscovery([source]) });
        const response = await invokeHttp(contract, dispatcher, "repository.get", {
            repositoryId: "configured",
            reference,
        });
        expect(response.status).toBe(status);
        const output = await response.json();
        expect(output).toMatchObject({ error: { code, output: { message: expect.any(String) } } });
        expect(JSON.stringify(output)).not.toContain("private upstream details");
    }
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountInstallations(dispatcher, {
        discovery: new RepositoryDiscovery([
            {
                id: "configured",
                search: async () => ({ revision: "one", mode: "lexical", degraded: true, results: [] }),
                read: async () => new TextEncoder().encode(JSON.stringify(contract.release)),
            },
        ]),
    });
    const mismatch = await invokeHttp(contract, dispatcher, "repository.get", {
        repositoryId: "configured",
        reference: { ...reference, digest: `sha256:${"0".repeat(64)}` },
    });
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({ error: { code: "RELEASE_MISMATCH" } });
});
