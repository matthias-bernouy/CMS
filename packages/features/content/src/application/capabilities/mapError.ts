import { captureFailure } from "content/application/captures/create";
import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { ContentCapabilityError } from "content/application/core/capabilities/errors";
import {
    ContentValidationError,
    PageRevisionConflictError,
    DuplicatePagePathError,
    BlocRevisionConflictError,
    ContentConflictError,
    ContentStorageFormatError,
    SiteBlocPublishedSlotConflictError,
    SiteBlocNotFoundError,
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
} from "content/application/core/validation/errors";
import { CmsPageNotFoundError } from "content/pages/core/contracts/renamePage";
import { PageReferencedError } from "content/pages/core/routing/errors";
import {
    SiteBlocReferenceCheckError,
    SiteBlocReferencedError,
    SiteBlocIdentityConflictError,
} from "content/blocs/core/catalogue/editing/references";
export const mapContentError: FeatureErrorMapper = (cause, capability) => {
    const captureError = captureFailure(cause);
    if (captureError && Object.hasOwn(capability.errors, captureError.code)) {
        return captureError;
    }
    const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
    let code: string;
    if (
        cause instanceof SiteBlocPublicationLockLostError ||
        cause instanceof SiteBlocPublicationRecoveryRequiredError ||
        cause instanceof ContentStorageFormatError
    ) {
        if (!Object.hasOwn(capability.errors, "CORE_UNAVAILABLE")) {
            return undefined;
        }
        return {
            code: "CORE_UNAVAILABLE",
            output: { message: "Content writes are temporarily unavailable. Retry after recovery." },
        };
    }
    if (cause instanceof ContentCapabilityError) {
        code = cause.code;
    } else if (capability.id.startsWith("site-blocs.")) {
        if (cause instanceof SiteBlocIdentityConflictError) {
            return { code: "REVISION_CONFLICT", output: { message: cause.publicMessage } };
        }
        if (cause instanceof SiteBlocReferenceCheckError && capability.id === "site-blocs.delete") {
            return { code: "REFERENCE_CHECK_INCOMPLETE", output: { message: cause.publicMessage } };
        }
        if (cause instanceof SiteBlocReferencedError && capability.id === "site-blocs.delete") {
            return {
                code: "BLOC_REFERENCED",
                output: {
                    message: cause.publicMessage,
                    references: cause.references,
                    truncated: cause.truncated,
                },
            };
        }
        if (status === 423 && Object.hasOwn(capability.errors, "UPGRADE_IN_PROGRESS")) {
            return { code: "UPGRADE_IN_PROGRESS", output: { message: "Content mutations are temporarily fenced." } };
        }
        if (
            !(
                cause instanceof SiteBlocNotFoundError ||
                cause instanceof BlocRevisionConflictError ||
                cause instanceof ContentConflictError ||
                cause instanceof ContentValidationError ||
                cause instanceof TypeError
            )
        ) {
            return undefined;
        }
        code =
            cause instanceof SiteBlocNotFoundError
                ? "NOT_FOUND"
                : cause instanceof BlocRevisionConflictError
                  ? "REVISION_CONFLICT"
                  : cause instanceof ContentConflictError
                    ? ["site-blocs.update", "site-blocs.delete"].includes(capability.id)
                        ? cause instanceof SiteBlocPublishedSlotConflictError
                            ? "INVALID_SITE_BLOC"
                            : "STATE_CONFLICT"
                        : "TAG_CONFLICT"
                    : cause instanceof ContentValidationError || cause instanceof TypeError
                      ? "INVALID_SITE_BLOC"
                      : "CORE_UNAVAILABLE";
    } else if (capability.id.startsWith("pages.") || capability.id.startsWith("examples.")) {
        if (
            !(
                cause instanceof CmsPageNotFoundError ||
                cause instanceof PageReferencedError ||
                cause instanceof PageRevisionConflictError ||
                cause instanceof DuplicatePagePathError ||
                cause instanceof ContentValidationError
            ) &&
            status !== 423
        ) {
            return undefined;
        }
        code =
            cause instanceof CmsPageNotFoundError
                ? "NOT_FOUND"
                : cause instanceof PageReferencedError
                  ? "PAGE_REFERENCED"
                  : cause instanceof PageRevisionConflictError
                    ? "REVISION_CONFLICT"
                    : cause instanceof DuplicatePagePathError
                      ? "PATH_CONFLICT"
                      : cause instanceof ContentValidationError
                        ? capability.id === "pages.rename"
                            ? "INVALID_TITLE"
                            : capability.id.startsWith("examples.")
                              ? "INVALID_INPUT"
                              : "INVALID_PAGE"
                        : "CORE_UNAVAILABLE";
    } else if (capability.id === "site.favicon.update") {
        if (!(cause instanceof ContentValidationError) && ![409, 423].includes(status)) {
            return undefined;
        }
        code = status === 409 ? "REVISION_CONFLICT" : status === 423 ? "UPGRADE_IN_PROGRESS" : "INVALID_INPUT";
    } else if (
        [
            "site.update",
            "localization.update",
            "localization.text.save",
            "theme.activate",
            "theme.token.save",
            "theme.token.reset",
        ].includes(capability.id)
    ) {
        code =
            status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "REVISION_CONFLICT"
                  : status === 423
                    ? "UPGRADE_IN_PROGRESS"
                    : "INVALID_INPUT";
    } else {
        return undefined;
    }
    if (!Object.hasOwn(capability.errors, code)) {
        code = "CORE_UNAVAILABLE";
    }
    if (!Object.hasOwn(capability.errors, code)) {
        return undefined;
    }
    return {
        code,
        output: {
            message: "The Content service could not complete the request.",
            ...(code === "INVALID_PAGE" && cause instanceof ContentValidationError && cause.diagnostics.length
                ? { diagnostics: cause.diagnostics }
                : {}),
        },
    };
};
