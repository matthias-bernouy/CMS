import { expect } from "bun:test";
import { IntegrationRepositoryContractError, IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

export function repository(fetchImpl: typeof fetch, timeoutMs = 100): HttpIntegrationDefinitionRepository {
    return new HttpIntegrationDefinitionRepository({
        baseUrl: "https://repo.example.test",
        fetch: fetchImpl,
        timeoutMs,
    });
}

export async function expectUnavailable(operation: Promise<unknown>): Promise<void> {
    const error = await rejected(operation);
    expect(error).toBeInstanceOf(IntegrationRepositoryUnavailableError);
    expect(error).toMatchObject({
        status: 503,
        publicCode: "integration_repository_unavailable",
        message: "Integration repository is unavailable",
    });
    expect(String(error)).not.toContain("internal-repository");
}

export async function expectInvalid(operation: Promise<unknown>): Promise<void> {
    const error = await rejected(operation);
    expect(error).toBeInstanceOf(IntegrationRepositoryContractError);
    expect(error).toMatchObject({
        status: 502,
        publicCode: "integration_repository_invalid_response",
        message: "Integration repository returned an invalid response",
    });
    expect(String(error)).not.toContain("internal route detail");
}

export async function rejected(operation: Promise<unknown>): Promise<unknown> {
    try {
        await operation;
    } catch (error) {
        return error;
    }
    throw new Error("expected operation to reject");
}
