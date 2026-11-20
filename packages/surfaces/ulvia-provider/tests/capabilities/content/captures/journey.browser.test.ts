import { expect, test } from "bun:test";
import { CapabilityMcpBinding, createCapabilityMcpHttpHandler, MCP_PROTOCOL_VERSION } from "@bernouy/cms-gateway/mcp";
import type { McpToolResult } from "@bernouy/cms-gateway/mcp";
import { GatewayError } from "@bernouy/cms-gateway";
import { officialContract } from "../../../execution/messages/fixtures";
import { captureFixture } from "./fixture";

test.skipIf(process.env.ULVIA_RUN_CAPTURE_BROWSER !== "1")(
    "MCP-only journey chooses an example, creates a draft, sees overflow, corrects and recaptures both viewports",
    async () => {
        const { call: provider, ports, close } = await captureFixture();
        try {
            const admission = await officialContract("ulvia/cms.content");
            let subjectId = "admin";
            const binding = new CapabilityMcpBinding({
                contracts: async () => [admission],
                inlineImageBytes: 4194304,
                invoker: {
                    invoke: async (call) => {
                        const response = (await provider(call.capabilityId, call.input as Record<string, unknown>, {
                            claims: {
                                actorKind: call.actor.kind === "administrator" ? "administrator" : "anonymous",
                                subjectId: call.actor.kind === "administrator" ? call.actor.subjectId : undefined,
                            },
                        }))!;
                        if (response.status === 403) {
                            await response.body?.cancel();
                            throw new GatewayError("not_authorized", "Forbidden");
                        }
                        const contentType = response.headers.get("content-type")?.split(";")[0];
                        if (contentType === "image/png") {
                            return {
                                kind: "binary",
                                requestId: crypto.randomUUID(),
                                stream: response.body!,
                                contentType,
                            };
                        }
                        const output = await response.json();
                        return output.error
                            ? {
                                  kind: "declared-error",
                                  requestId: crypto.randomUUID(),
                                  errorCode: output.error.code,
                                  retryable: false,
                                  output: output.error.output,
                              }
                            : { kind: "success", requestId: crypto.randomUUID(), output };
                    },
                },
            });
            const handler = createCapabilityMcpHttpHandler({
                binding,
                allowedOrigins: ["https://site.test"],
                serverInfo: { name: "capture-proof", version: "1" },
                resolveContext: async () => ({ siteId: "default", actor: { kind: "administrator", subjectId } }),
            });
            let id = 0;
            async function rpc(method: string, params: unknown = {}) {
                const response = await handler(
                    new Request("https://site.test/.cms/mcp", {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            accept: "application/json, text/event-stream",
                            "mcp-protocol-version": MCP_PROTOCOL_VERSION,
                        },
                        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
                    }),
                );
                const result = await response.json();
                expect(result.error).toBeUndefined();
                return result.result;
            }
            const catalogue = (await rpc("tools/list")).tools;
            const invoke = async (capability: string, input: unknown): Promise<McpToolResult> => {
                const tool = catalogue.find(
                    (entry: { _meta: Record<string, string> }) => entry._meta["io.ulvia/capability"] === capability,
                );
                expect(tool).toBeDefined();
                return rpc("tools/call", { name: tool.name, arguments: { input } });
            };
            const output = async (capability: string, input: unknown): Promise<any> => {
                const result = await invoke(capability, input);
                expect(result.isError).not.toBeTrue();
                return result.structuredContent!.output;
            };
            const examples = await output("examples.list", { collectionId: "proof/ui", locale: "en" });
            expect(examples.items[0].previews).toHaveLength(2);
            const example = await output("examples.get", { collectionId: "proof/ui", exampleId: examples.items[0].id });
            const demonstration = await output("examples.capture", {
                collectionId: "proof/ui",
                exampleId: "sample",
                previewId: "mobile",
                locale: "en",
                themeMode: "light",
            });
            expect(
                (await invoke("captures.image", { captureId: demonstration.captureId })).content.some(
                    (part) => part.type === "image",
                ),
            ).toBeTrue();
            const page = await output("pages.create", {
                path: "/proof",
                title: "Proof",
                content: example.document.html,
            });
            const capture = (revision: number, width: number) =>
                output("pages.capture", {
                    id: page.id,
                    expectedRevision: revision,
                    locale: "en",
                    options: { width, height: 600, mode: "viewport", themeMode: "light" },
                });
            const before = await capture(page.revision, 390);
            expect(before.diagnostics).toContain("Horizontal overflow detected");
            const image = await invoke("captures.image", { captureId: before.captureId });
            expect(image.content.some((part) => part.type === "image")).toBeTrue();
            subjectId = "other-admin";
            expect((await invoke("captures.image", { captureId: before.captureId })).isError).toBeTrue();
            subjectId = "admin";
            expect(
                (await provider(
                    "pages.capture",
                    {
                        id: page.id,
                        expectedRevision: page.revision,
                        locale: "en",
                        options: { width: 390, height: 600, mode: "viewport", themeMode: "light" },
                    },
                    { claims: { actorKind: "anonymous" } },
                ))!.status,
            ).toBe(403);
            const updated = await output("pages.update", {
                id: page.id,
                expectedRevision: page.revision,
                content: '<div cms-bloc="proof--ui--panel"><p>Fits the viewport.</p></div>',
            });
            expect(
                (
                    await invoke("pages.capture", {
                        id: page.id,
                        expectedRevision: page.revision,
                        locale: "en",
                        options: { width: 390, height: 600, mode: "viewport", themeMode: "light" },
                    })
                ).isError,
            ).toBeTrue();
            for (const width of [390, 960]) {
                const after = await capture(updated.revision, width);
                expect(after.diagnostics).not.toContain("Horizontal overflow detected");
                expect(after.source.revision).toStartWith(String(updated.revision) + ":");
                expect(after.digest).not.toBe(before.digest);
                expect(
                    (await invoke("captures.image", { captureId: after.captureId })).content.some(
                        (part) => part.type === "image",
                    ),
                ).toBeTrue();
            }
            expect((await ports.repo.getPageById(page.id))!.visible).toBeFalse();
        } finally {
            await close();
        }
    },
    45_000,
);
