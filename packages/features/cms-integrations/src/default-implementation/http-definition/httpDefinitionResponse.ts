import { IntegrationRepositoryContractError } from "../../core/errors";
import { readBoundedResponseBody } from "./httpDefinitionBody";

export async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
    await assertJsonContentType(response);
    const bytes = await readBoundedResponseBody(response, { signal });
    try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch {
        throw new IntegrationRepositoryContractError();
    }
}

async function assertJsonContentType(response: Response): Promise<void> {
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationRepositoryContractError();
    }
}
