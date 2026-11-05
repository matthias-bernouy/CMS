import { expect, test } from "bun:test";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import type { RepositoryAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { CollectionPublicationRecoveryError } from "@bernouy/cms-repository/repository/authoring";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerAuthoringCapabilities } from "../../../src/capabilities/installations/authoring";
import { officialContract, resolvedContract, invokeHttp } from "../messages/fixtures";

const preparationId = "c9ddc861-4e76-48cb-8188-7cfa4a94a11d";
const digest = `sha256:${"a".repeat(64)}`;
test.each(["contract", "provider-manifest"] as const)(
    "%s authoring round trips through admitted HTTP schemas and exposes corresponding MCP tools",
    async (kind) => {
        const contract = await resolvedContract("ulvia/cms.authoring");
        const field = kind === "contract" ? "contractId" : "providerId";
        const coordinate = { publisherId: "community", version: "1.0.0", [field]: "community/notes" };
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        const fake = {
            prepareArtifact: async () => ({
                ...coordinate,
                preparationId,
                digest,
                sourceDigest: digest,
                repositoryId: "local",
                diagnostics: [],
            }),
            publishArtifact: async () => ({ ...coordinate, kind, digest, repositoryId: "local", added: true }),
            artifactSources: async () => ({ sourceJson: "{}", releaseDigest: digest }),
        } as unknown as RepositoryAuthoring;
        registerAuthoringCapabilities(dispatcher, fake);
        const prepare = await invokeHttp(contract, dispatcher, `prepare-${kind}`, { sourceJson: "{}" });
        expect(prepare.status).toBe(200);
        expect(await prepare.json()).toMatchObject({
            valid: true,
            preparationId,
            [field]: "community/notes",
        });
        const publish = await invokeHttp(contract, dispatcher, `publish-${kind}`, {
            preparationId,
            expectedDigest: digest,
        });
        expect(publish.status).toBe(200);
        expect(await publish.json()).toMatchObject({ kind, digest });
        const source = await invokeHttp(contract, dispatcher, `get-${kind}-sources`, {
            namespace: "community",
            [field]: "community/notes",
            version: "1.0.0",
        });
        expect(source.status).toBe(200);
        expect(await source.json()).toMatchObject({ releaseDigest: digest });
        const invocations: unknown[] = [];
        const context = { siteId: "instance-a", actor: { kind: "administrator" as const, subjectId: "local:admin" } };
        const binding = new CapabilityMcpBinding({
            contracts: async () => [await officialContract("ulvia/cms.authoring")],
            invoker: {
                invoke: async (input) => {
                    invocations.push(input);
                    return { kind: "success", requestId: crypto.randomUUID(), output: {} };
                },
            },
        });
        const { tools } = await binding.list(context);
        for (const capabilityId of [`prepare-${kind}`, `publish-${kind}`, `get-${kind}-sources`]) {
            const name = capabilityToolName(
                "ulvia/cms.authoring",
                capabilityId,
                "mcp",
                `authoring_${capabilityId.replaceAll("-", "_")}`,
            );
            expect(tools.find((tool) => tool.name === name)?._meta["io.ulvia/access"]).toBe("admin");
            const input = capabilityId.startsWith("prepare-")
                ? { sourceJson: "{}" }
                : capabilityId.startsWith("publish-")
                  ? { preparationId, expectedDigest: digest }
                  : { namespace: "community", [field]: "community/notes", version: "1.0.0" };
            await binding.call(name, { input }, context);
            expect(invocations.at(-1)).toMatchObject({
                ...context,
                contractId: "ulvia/cms.authoring",
                capabilityId,
                bindingTransport: "mcp",
            });
            await expect(binding.call(name, { input: {}, actor: { kind: "system" } }, context)).rejects.toThrow();
        }
    },
);
test.each(["contract", "provider-manifest"] as const)(
    "%s source-retention recovery retains its exact capability-specific retry instruction",
    async (kind) => {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        registerAuthoringCapabilities(dispatcher, {
            publishArtifact: async () => {
                throw new CollectionPublicationRecoveryError(
                    preparationId,
                    digest,
                    "sources-pending",
                    { cause: new Error("internal secret diagnostic") },
                    kind,
                );
            },
        } as unknown as RepositoryAuthoring);
        const result = await invokeHttp(await resolvedContract("ulvia/cms.authoring"), dispatcher, `publish-${kind}`, {
            preparationId,
            expectedDigest: digest,
        });
        expect(result.status).toBe(503);
        const body = await result.json();
        expect(body.error.output).toMatchObject({ publicationState: "sources-pending", preparationId, digest });
        expect(body.error.output.message).toContain(`Retry publish-${kind}`);
        expect(body.error.output.message).not.toContain("internal secret diagnostic");
    },
);
