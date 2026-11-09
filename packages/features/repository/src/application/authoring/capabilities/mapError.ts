import { AuthoringAuthorityError } from "../core/authority";
import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { AuthoringInputError } from "repository/application/authoring/core/input";
import { AuthoringDependencyError } from "repository/repository/authoring/resources/dependencies/transport";
import { CollectionPublicationRecoveryError } from "repository/repository/authoring/preparations/errors";
import { NamespaceAccessError } from "repository/repository/authoring/namespaces";
import { RepositoryRequestError } from "repository/repository/core/errors";
export const mapAuthoringError: FeatureErrorMapper = (cause) => {
    if (cause instanceof AuthoringAuthorityError) {
        return { code: "FORBIDDEN", output: { message: "Current administrator authority is required." } };
    }
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
