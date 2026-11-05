import { expect, test } from "bun:test";
import { mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";
import { sourceSnapshot } from "../../../packages/runtimes/ulvia-provider-server/tests/stores/repository/authoring/fixture";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE };
const integration = Object.values(images).every(Boolean) ? test : test.skip;

integration(
    "real MCP preparation diagnoses invalid evolution and preserves a racing publication refusal",
    async () => {
        const stack = await mcpContainers(images as Record<keyof typeof images, string>);
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            connection = await connectBrowser(stack.cmsUrl, stack.administrator);
            const authoring = (capability: string, input: Record<string, unknown> = {}) =>
                connection!.call("ulvia/cms.authoring", capability, input);
            await authoring("configure-connection", { token: stack.repository.pat.token });
            const namespace = `authoring.test${crypto.randomUUID().replaceAll("-", "")}`;
            await authoring("claim-namespace", { namespace });
            const initial = await connection.call("ulvia/cms.installations", "list-collection-installations");
            const source = (version: string, label?: string) => {
                const snapshot = JSON.parse(sourceSnapshot(version, namespace));
                if (label) {
                    const definition = snapshot.files.find((file: { path: string }) => file.path === "definition.json");
                    const value = JSON.parse(definition.content);
                    value.configuration = {
                        schema: {
                            type: "object",
                            properties: { label: { type: "string", maxLength: 16 } },
                            required: ["label"],
                        },
                        defaults: { label },
                    };
                    definition.content = JSON.stringify(value);
                }
                return JSON.stringify(snapshot);
            };
            const stable = await authoring("prepare-collection", { sourceJson: source("1.0.0") });
            expect(stable).toMatchObject({ valid: true, preflight: "complete" });
            await authoring("publish-collection", {
                preparationId: stable.preparationId,
                expectedDigest: stable.digest,
            });
            const patch = await authoring("prepare-collection", { sourceJson: source("1.0.1", "Invalid patch") });
            expect(patch.valid).toBe(false);
            expect(patch.preparationId).toBeUndefined();
            expect(patch.diagnostics[0].code).toBe("collection.publication.minor_required");
            const left = await authoring("prepare-collection", { sourceJson: source("1.1.0", "Left") });
            const right = await authoring("prepare-collection", { sourceJson: source("1.1.0", "Right") });
            expect(left.preflight).toBe("complete");
            expect(right.preflight).toBe("complete");
            await authoring("publish-collection", { preparationId: right.preparationId, expectedDigest: right.digest });
            const tool = connection.tools.find(
                (item) =>
                    item._meta["io.ulvia/contract"] === "ulvia/cms.authoring" &&
                    item._meta["io.ulvia/capability"] === "publish-collection",
            )!;
            const refused = await connection.rpc("tools/call", {
                name: tool.name,
                arguments: { input: { preparationId: left.preparationId, expectedDigest: left.digest } },
            });
            expect(refused.isError).toBe(true);
            expect(refused.structuredContent.error).toMatchObject({
                code: "INVALID_INPUT",
                output: { publicationCode: "immutable_conflict" },
            });
            expect(
                (
                    await authoring("get-collection-sources", {
                        namespace,
                        collectionId: `${namespace}/sample`,
                        version: "1.1.0",
                    })
                ).releaseDigest,
            ).toBe(right.digest);
            expect((await connection.call("ulvia/cms.installations", "list-collection-installations")).revision).toBe(
                initial.revision,
            );
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await stack.close();
        }
    },
    180_000,
);
