import type { Edge } from "../../interfaces/entities/Edge";
import type { EdgeRepository } from "../../interfaces/repositories/EdgeRepository";
import { hashEdgeToken } from "./issueEdgeToken";

/**
 * Resolve the `Edge` calling an `/edge-api/*` endpoint, or `null` if the
 * caller didn't present a valid bearer token. Returns `null` rather than
 * throwing so endpoints decide the response shape themselves (typically
 * 401 with a JSON envelope).
 *
 * The lookup is `O(log n)` thanks to the unique index on `tokenHash`.
 * Comparing sha256 hex strings via `===` is fine here: the index already
 * does an equality lookup, and a successful hit means the input hash
 * matches exactly — no timing-attack window narrower than what the
 * indexed query exposes.
 */
export async function authenticateEdge(req: Request, edgeRepo: EdgeRepository): Promise<Edge | null> {
    const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!header) return null;
    const match = header.match(/^Bearer\s+(\S+)$/);
    if (!match) return null;
    const token = match[1]!;
    const hash  = hashEdgeToken(token);
    return edgeRepo.getByTokenHash(hash);
}
