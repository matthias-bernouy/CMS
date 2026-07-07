import type { IntegrationAsset } from "../interfaces/IntegrationDefinitionRepository";

export async function responseAsset(response: Response): Promise<IntegrationAsset> {
    return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
}
