import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import { integrationDefinition, type integrationPackage } from "../fixtures";

export async function temporaryRoot(roots: string[]): Promise<string> {
    const root = await mkdtemp(`${tmpdir()}/ulvia-cli-`);
    roots.push(root);
    return root;
}

export function remoteFixture(
    resolved: Awaited<ReturnType<typeof integrationPackage>>,
    reviewedSchemaBaselines: readonly unknown[] = [],
): typeof fetch {
    const definition = integrationDefinition(resolved.envelope.kind, resolved.envelope.version);
    const version = {
        version: resolved.envelope.version,
        path: `${resolved.envelope.kind}/versions/${resolved.envelope.version}`,
        definition: "definition.json",
    };
    return async (request) => {
        const input = request instanceof Request ? request : new Request(request);
        const url = new URL(input.url);
        const headers = { "content-type": "application/json" };
        if (url.pathname.endsWith("/api/integrations/index")) {
            return Response.json({
                kind: resolved.envelope.kind,
                label: definition.label,
                stable: resolved.envelope.version,
                latest: resolved.envelope.version,
                versions: [version],
            });
        }
        if (url.pathname.endsWith("/api/integrations/definition")) {
            return Response.json(definition);
        }
        if (url.pathname.endsWith("/api/integrations/package")) {
            return new Response(input.method === "HEAD" ? null : Uint8Array.from(resolved.canonicalBytes).buffer, {
                headers: {
                    ...headers,
                    "content-length": String(resolved.canonicalBytes.byteLength),
                    [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest,
                },
            });
        }
        if (url.pathname.endsWith("/api/integrations/schema-baselines")) {
            return Response.json(reviewedSchemaBaselines);
        }
        return Response.json({ error: "not found" }, { status: 404, headers });
    };
}

export const emptyRemote: typeof fetch = async () => Response.json({ error: "not found" }, { status: 404 });
