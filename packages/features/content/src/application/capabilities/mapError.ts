import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { ContentCapabilityError } from "content/application/core/capabilities/errors";
import {
    ContentValidationError,
    PageRevisionConflictError,
    DuplicatePagePathError,
    BlocRevisionConflictError,
    ContentConflictError,
    SiteBlocNotFoundError,
} from "content/application/core/validation/errors";
import { CmsPageNotFoundError } from "content/pages/core/contracts/renamePage";
import { PageReferencedError } from "content/pages/core/routing/errors";
export const mapContentError: FeatureErrorMapper = (cause, capability) => {
    const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
    let code: string;
    if (cause instanceof ContentCapabilityError) {
        code = cause.code;
    } else if (capability.id.startsWith("site-blocs.")) {
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
                    ? "TAG_CONFLICT"
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
