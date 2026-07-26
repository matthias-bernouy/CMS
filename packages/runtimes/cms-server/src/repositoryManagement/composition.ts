import type { ControlCmsOptions } from "@bernouy/cms-control";
import type { RepositoryManagementGatewayConfig } from "./config";
import { HttpRepositoryManagementGateway } from "./gateway";
import { readRepositoryManagementTokenFile } from "./tokenFile";

export async function createProductionRepositoryManagementAccess(
    config: RepositoryManagementGatewayConfig | undefined,
    fetchImpl?: typeof fetch,
): Promise<NonNullable<ControlCmsOptions["repositoryManagement"]> | undefined> {
    if (!config) {
        return undefined;
    }
    const token = await readRepositoryManagementTokenFile(config.tokenFile);
    return Object.freeze({
        administratorSubjectIdentifier: config.administratorSubjectIdentifier,
        gateway: new HttpRepositoryManagementGateway({
            baseUrl: config.url,
            token,
            administratorSubjectIdentifier: config.administratorSubjectIdentifier,
            timeoutMs: config.timeoutMs,
            ...(fetchImpl ? { fetch: fetchImpl } : {}),
        }),
    });
}
