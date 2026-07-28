import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";
import { readBoundedResponseBody } from "./httpDefinitionBody";

export async function responseAsset(
    response: Response,
    maxBytes?: number,
    signal?: AbortSignal,
): Promise<IntegrationAsset> {
    return {
        bytes: await readBoundedResponseBody(response, { maxBytes, signal, allowMissingBody: true }),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
}
