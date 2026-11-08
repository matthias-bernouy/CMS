import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { ReleaseValidationError } from "@bernouy/ulvia-contracts";
import { ProviderManifestValidationError } from "@bernouy/ulvia-providers";
import { CollectionValidationError, CollectionPublicationError } from "repository/collections/core/errors";
import { RepositoryRequestError } from "repository/repository/core/errors";
import { RepositoryDiscoveryError } from "repository/repository/search/core/errors";

export const mapRepositoryError: FeatureErrorMapper = (cause) => {
    if (cause instanceof RepositoryRequestError || cause instanceof RepositoryDiscoveryError) {
        return {
            code: cause.code,
            output:
                cause instanceof RepositoryRequestError && cause.publicationCode
                    ? {
                          message: cause.message,
                          publicationCode: cause.publicationCode,
                          ...(cause.publicationResource ? { publicationResource: cause.publicationResource } : {}),
                      }
                    : { message: "The Repository request was refused." },
        };
    }
    if (cause instanceof CollectionPublicationError) {
        return {
            code: "REJECTED",
            output: {
                message: cause.message,
                publicationCode: cause.publicationCode,
                ...(cause.publicationResource ? { publicationResource: cause.publicationResource } : {}),
            },
        };
    }
    if (
        cause instanceof ReleaseValidationError ||
        cause instanceof CollectionValidationError ||
        cause instanceof ProviderManifestValidationError
    ) {
        return { code: "REJECTED", output: { message: "The Repository artifact was refused." } };
    }
    return undefined;
};
