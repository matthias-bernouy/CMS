import { type CmsMcpHost } from "./protocol";
import type { McpInvocationContext } from "@bernouy/cms-gateway/mcp";

const resources = [
    {
        uri: "ulvia://cms/repository-namespaces",
        name: "repository-namespaces",
        description: "Remembered namespaces with live ownership checks",
        mimeType: "application/json",
    },
    {
        uri: "ulvia://cms/site-files",
        name: "site-files",
        description: "Upload and manage files in this instance",
        mimeType: "text/markdown",
    },
    {
        uri: "ulvia://cms/collection-authoring",
        name: "collection-authoring",
        description: "How to prepare, validate, publish and install immutable collections",
        mimeType: "text/markdown",
    },
    {
        uri: "ulvia://cms/installed-collections",
        name: "installed-collections",
        description: "Current installed collection versions and installation revision",
        mimeType: "application/json",
    },
];

export function createAuthoringResources(host: CmsMcpHost) {
    return {
        async list(_context: McpInvocationContext) {
            return { resources };
        },
        async read(uri: string, context: McpInvocationContext) {
            const document =
                uri === "ulvia://cms/site-files"
                    ? { contractId: "ulvia.cms.files", path: "site-files.md" }
                    : uri === "ulvia://cms/collection-authoring"
                      ? { contractId: "ulvia.cms.authoring", path: "collection-authoring.md" }
                      : undefined;
            if (document) {
                if (!host.invoker.resolveContract) {
                    throw new Error("Contract discovery is unavailable");
                }
                const selected = await host.invoker.resolveContract({
                    siteId: context.siteId,
                    contractId: document.contractId,
                });
                if (!selected.release.documentation?.some((entry) => entry.path === document.path)) {
                    throw new Error("Selected documentation is unavailable");
                }
                const reference = {
                    contractId: document.contractId,
                    releaseDigest: selected.digest,
                    path: document.path,
                };
                let offset = 0;
                let text = "";
                for (let page = 0; page < 8; page++) {
                    const result = await host.invoker.invoke({
                        ...context,
                        contractId: "ulvia.cms.installations",
                        capabilityId: "documentation.get",
                        input: { reference, offset },
                    });
                    if (result.kind !== "success" || !result.output || typeof result.output !== "object") {
                        throw new Error("Documentation read failed");
                    }
                    const output = result.output as { content?: unknown; nextOffset?: unknown };
                    if (typeof output.content !== "string" || output.content.length > 16_384) {
                        throw new Error("Invalid documentation response");
                    }
                    text += output.content;
                    if (output.nextOffset === null) {
                        return { contents: [{ uri, mimeType: "text/markdown", text }] };
                    }
                    if (
                        typeof output.nextOffset !== "number" ||
                        !Number.isSafeInteger(output.nextOffset) ||
                        output.nextOffset <= offset
                    ) {
                        throw new Error("Invalid documentation continuation");
                    }
                    offset = output.nextOffset;
                }
                throw new Error("Documentation resource exceeds its page budget");
            }
            if (!["ulvia://cms/installed-collections", "ulvia://cms/repository-namespaces"].includes(uri)) {
                throw new Error("Unknown resource");
            }
            const result = await host.invoker.invoke({
                ...context,
                contractId:
                    uri === "ulvia://cms/repository-namespaces" ? "ulvia.cms.authoring" : "ulvia.cms.installations",
                capabilityId:
                    uri === "ulvia://cms/repository-namespaces" ? "list-namespaces" : "list-collection-installations",
                input: {},
            });
            if (result.kind !== "success") {
                throw new Error("Collection state is unavailable");
            }
            return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result.output) }] };
        },
    };
}
