import { CollectionValidationError } from "repository/collections/core/errors";
import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { InstallationError } from "repository/application/installations/core/errors";
import { DocumentationError } from "@bernouy/documentation";
import { RepositoryDiscoveryError } from "repository/repository/search/core/errors";
const collectionCommands = new Set([
    "list-site-usage",
    "install-collection",
    "update-collection-configuration",
    "plan-collection-upgrade",
    "apply-collection-upgrade",
    "resume-collection-upgrade",
    "plan-contract-upgrade",
    "apply-contract-upgrade",
    "resume-contract-upgrade",
]);
const administrationCommands = new Set([
    "import-provider-manifest",
    "preview-provider-connection",
    "approve-provider-connection",
    "get-provider-access",
    "pair-provider-connection",
]);
const providerCommands = new Set([
    "set-provider-status",
    "gateway.provider.prepare",
    "gateway.dispatch.prepare",
    "gateway.invocation.issue",
]);
/** Preserve each workflow's classification without repeating catch wrappers in executors. */
export const mapInstallationError: FeatureErrorMapper = (cause, capability) => {
    let code: string | undefined;
    const record = cause && typeof cause === "object" ? cause : undefined;
    const status = record && "status" in record ? Number(record.status) : 0;
    const reason = record && "code" in record ? String(record.code) : "";
    if (
        cause instanceof InstallationError ||
        (capability.id.startsWith("documentation.") && cause instanceof DocumentationError) ||
        (capability.id.startsWith("repository.") && cause instanceof RepositoryDiscoveryError)
    ) {
        code = cause.code;
    } else if (capability.id.startsWith("initialization.")) {
        code =
            status === 409
                ? "REVISION_CONFLICT"
                : status === 423
                  ? "UPGRADE_IN_PROGRESS"
                  : status === 404
                    ? "NOT_FOUND"
                    : cause instanceof CollectionValidationError
                      ? "RELEASE_MISMATCH"
                      : cause instanceof TypeError || cause instanceof RangeError || status === 400 || status === 422
                        ? "INVALID_INPUT"
                        : "CORE_UNAVAILABLE";
    } else if (providerCommands.has(capability.id)) {
        if (status === 403 || reason === "not_authorized") {
            code = "FORBIDDEN";
        } else if (status === 429) {
            code = "RATE_LIMITED";
        } else if (status === 404 || reason === "installation_not_found" || reason === "route_not_found") {
            code = "NOT_FOUND";
        } else if (status === 409 || reason === "revision_conflict") {
            code = "REVISION_CONFLICT";
        } else if (
            reason === "installation_revoked" ||
            reason === "installation_selected" ||
            reason.endsWith("_protected")
        ) {
            code = "INVALID_STATE";
        } else if (reason) {
            code = "INVALID_SELECTION";
        }
    } else if (capability.id.startsWith("gateway.delegation.") && reason === "not_authorized") {
        code = "FORBIDDEN";
    } else if (collectionCommands.has(capability.id) || administrationCommands.has(capability.id)) {
        if (status === 404) {
            code = "NOT_FOUND";
        } else if (status === 409) {
            code = "REVISION_CONFLICT";
        } else if (status === 423) {
            code = "UPGRADE_IN_PROGRESS";
        } else if (cause instanceof TypeError || cause instanceof RangeError || status === 400 || status === 422) {
            code = "INVALID_INPUT";
        } else if (status === 403 && administrationCommands.has(capability.id)) {
            code = "FORBIDDEN";
        }
    }
    return code && Object.hasOwn(capability.errors, code)
        ? { code, output: { message: "The installation request was refused." } }
        : undefined;
};
