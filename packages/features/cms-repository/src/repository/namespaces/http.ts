import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { readRepositoryMutationBody } from "../publication/protocol";
import type { RepositoryNamespaceAuthority } from "./authority";

/** Public ownership endpoints. Operator authentication grants no namespace recovery authority. */
export class RepositoryNamespaceEndpoint {
    constructor(private readonly authority: RepositoryNamespaceAuthority) {}

    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.pathname === "/v1/repository" && (request.method === "GET" || request.method === "HEAD")) {
            return json(request, {
                protocol: "ulvia-community-repository/v1",
                repositoryId: this.authority.repositoryId,
            });
        }
        const match = /^\/v1\/namespaces\/([a-z0-9.-]+)$/u.exec(url.pathname);
        if (!match) {
            return null;
        }
        try {
            if (request.method === "GET" || request.method === "HEAD") {
                if ([...url.searchParams.keys()].some((key) => key !== "revision")) {
                    throw new Error("Unsupported namespace query");
                }
                const revision = url.searchParams.get("revision");
                const value = await this.authority.get(match[1]!, revision === null ? undefined : Number(revision));
                return value ? json(request, value) : new Response(null, { status: 404 });
            }
            if (request.method !== "POST" || url.search) {
                return new Response(null, { status: 405 });
            }
            const value = parseStrictJson(await readRepositoryMutationBody(request, 12_288), 12_288, 6) as Record<
                string,
                unknown
            >;
            if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value) ||
                Object.keys(value).some((key) => !["action", "publicKey", "proof", "replacementProof"].includes(key))
            ) {
                throw new Error("Invalid namespace operation");
            }
            let result: unknown;
            if (value.action === "claim" && typeof value.publicKey === "string") {
                result = await this.authority.claim(match[1]!, value.publicKey, value.proof);
            } else if (value.action === "rotate" && typeof value.publicKey === "string") {
                result = await this.authority.rotate(match[1]!, value.publicKey, value.proof, value.replacementProof);
            } else if (value.action === "revoke") {
                result = await this.authority.revoke(match[1]!, value.proof);
            } else {
                throw new Error("Invalid namespace operation");
            }
            return json(request, result);
        } catch {
            return Response.json(
                { error: { code: "namespace_rejected", message: "Namespace operation rejected" } },
                { status: 409 },
            );
        }
    }
}

function json(request: Request, value: unknown): Response {
    return new Response(request.method === "HEAD" ? null : JSON.stringify(value), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}
