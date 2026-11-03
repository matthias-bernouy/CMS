import type { ResolvedContract } from "@bernouy/cms-repository/contracts";
import { RepositoryCapabilityError } from "@bernouy/cms-repository/repository/capabilities";
import type { RepositoryCapabilityService } from "@bernouy/cms-repository/repository/capabilities";
import { RepositoryDiscoveryError } from "@bernouy/cms-repository/repository/search";
import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import type { ProviderCapabilityRegistry, ProviderBinaryResult } from "../dispatch/registry";
import type { UlviaProviderGateway } from "../ports";
import { actorSubject } from "./access/support";

/** Only an explicitly composed Repository profile registers these handlers. */
export function registerRepositoryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    repository: RepositoryCapabilityService,
    contract: ResolvedContract,
    gateway: UlviaProviderGateway,
): void {
    for (const { definition } of contract.capabilities) {
        dispatcher.register(contract.release.contractId, definition.id, async (input, context) => {
            try {
                const accountId = definition.access === "public" ? undefined : await actorSubject(gateway, context);
                const output = await repository.invoke(definition.id, input, context.binaryBody, { accountId });
                if (definition.output.type !== "binary") {
                    return output;
                }
                const bytes = output as Omit<ProviderBinaryResult, "kind"> & { digest: string };
                return {
                    kind: "binary",
                    stream: bytes.stream,
                    contentType: definition.id === "asset-download" ? "application/octet-stream" : bytes.contentType,
                    contentLength: bytes.contentLength,
                    headers: { etag: `"${bytes.digest}"`, "cache-control": "public, max-age=31536000, immutable" },
                } satisfies ProviderBinaryResult;
            } catch (error) {
                if (error instanceof RepositoryCapabilityError) {
                    throw new ProviderCapabilityDispatchError(error.code, error.code === "NOT_FOUND" ? 404 : 409);
                }
                if (error instanceof RepositoryDiscoveryError) {
                    throw new ProviderCapabilityDispatchError(
                        error.code,
                        error.code === "CORE_UNAVAILABLE"
                            ? 503
                            : error.code === "NOT_FOUND"
                              ? 404
                              : ["INVALID_INPUT", "CATALOGUE_TOO_LARGE"].includes(error.code)
                                ? 422
                                : 409,
                    );
                }
                throw error;
            }
        });
    }
}
