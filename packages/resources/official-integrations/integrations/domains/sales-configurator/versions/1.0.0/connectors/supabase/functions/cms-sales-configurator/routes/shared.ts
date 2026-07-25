import { HttpError } from "../core/errors.ts";
import { privateJson } from "../core/http.ts";
import { camelize, text } from "../core/records.ts";
import { rpc } from "../core/rest.ts";
import { publicProposalProjection } from "../services/projection.ts";
import { shareTokenHash } from "../services/token.ts";

export async function getSharedProposal(request: Request): Promise<Response> {
    const token = text(new URL(request.url).searchParams.get("token"));
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw unavailable();
    }
    try {
        const result = await rpc("read_shared_proposal", {
            p_token_hash: await shareTokenHash(token),
        });
        const projection = publicProposalProjection(camelize(result));
        if (!projection) {
            throw unavailable();
        }
        return privateJson(projection);
    } catch (error) {
        if (error instanceof HttpError && [403, 404, 410].includes(error.status)) {
            throw unavailable();
        }
        throw error;
    }
}

function unavailable(): HttpError {
    return new HttpError(404, "shared proposal unavailable");
}
