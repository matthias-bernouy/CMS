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
const guide = `# Collection authoring\nPass sourceJson as JSON with files: [{path, content}] and optional assets. Binary assets reference either {path, fileId, generation} from this site or {path, publisherId, collectionId, version, releaseDigest, assetId} from the configured Repository. Sources are bounded to 1 MiB, 2048 files and 64 binary references.\nFor new collections use ulvia-collection/v2. Every Bloc needs a translated description and nonempty categories array. Listed Blocs reference examples and one matching-root defaultExample. Author examples in examples/<folder>/definition.json plus document.html with explicit preview frame widths and heights; do not author thumbnail or default.html. Interaction behavior belongs in descriptions.\nWork with authored files: definition.json, translations/<locale>/*.json, blocs/<folder>/definition.json, markup.html, optional style.css and bloc.ts, assets/, texts/, theme/ and migrations/.\nUse repository_prepare_collection to validate a complete source snapshot. Inspect valid and diagnostics; publish only when valid is true. Inspect its digest and browser risk, then repository_publish_collection to publish the exact prepared result. Publication requires a configured namespace identity. Use installations_install_collection or installations_upgrade_collection with the exact repository, version, digest and current installation revision. Publication and installation are separate; retries never overwrite an existing release.\nThe CMS has no persistent editing workspace. Read retained source snapshots before preparing the next version. Site content and configuration stay on the site.\n`;

export function createAuthoringResources(host: CmsMcpHost) {
    return {
        async list(_context: McpInvocationContext) {
            return { resources };
        },
        async read(uri: string, context: McpInvocationContext) {
            if (uri === "ulvia://cms/site-files") {
                return {
                    contents: [
                        {
                            uri,
                            mimeType: "text/markdown",
                            text: "# Site files\nCreate a site upload, then PUT raw bytes to the returned uploadUrl with Authorization: Bearer <your MCP access token> and Upload-Token: <uploadToken>. The client supplies bytes; never encode an entire file in tool arguments. Complete the upload through its MCP tool, then call workspace.get to obtain fileId and generation. Use these exact references for collection source assets. The server binds reads and writes to this instance’s managed file namespace. Signed download URLs expire; file visibility is a separate choice.",
                        },
                    ],
                };
            }
            if (uri === "ulvia://cms/collection-authoring") {
                return { contents: [{ uri, mimeType: "text/markdown", text: guide }] };
            }
            if (!["ulvia://cms/installed-collections", "ulvia://cms/repository-namespaces"].includes(uri)) {
                throw new Error("Unknown resource");
            }
            const result = await host.invoker.invoke({
                ...context,
                contractId:
                    uri === "ulvia://cms/repository-namespaces" ? "ulvia.cms.repository" : "ulvia.cms.installations",
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
