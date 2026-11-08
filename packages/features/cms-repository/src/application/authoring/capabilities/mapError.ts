import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { AuthoringInputError } from "cms-repository/application/authoring/core/input";
import { AuthoringDependencyError } from "cms-repository/repository/authoring/resources/dependencies/transport";
import { CollectionPublicationRecoveryError } from "cms-repository/repository/authoring/preparations/errors";
import { NamespaceAccessError } from "cms-repository/repository/authoring/namespaces";
import { RepositoryRequestError } from "cms-repository/repository/core/errors";
export const mapAuthoringError: FeatureErrorMapper = (cause) => {
    if (cause instanceof AuthoringDependencyError) {
        return { code: "CORE_UNAVAILABLE", output: { message: "The authoring dependency is unavailable." } };
    }
    if (cause instanceof CollectionPublicationRecoveryError) {
        return {
            code: cause.retryable ? "CORE_UNAVAILABLE" : "INVALID_INPUT",
            output: {
                message: cause.message,
                publicationState: cause.publicationState,
                preparationId: cause.preparationId,
                digest: cause.digest,
            },
        };
    }
    if (
        cause instanceof NamespaceAccessError ||
        cause instanceof RepositoryRequestError ||
        cause instanceof AuthoringInputError
    ) {
        return {
            code: "INVALID_INPUT",
            output:
                cause instanceof RepositoryRequestError && cause.publicationCode
                    ? {
                          message: cause.message,
                          publicationCode: cause.publicationCode,
                          ...(cause.publicationResource ? { publicationResource: cause.publicationResource } : {}),
                      }
                    : { message: "The authoring request was refused." },
        };
    }
    return undefined;
};
