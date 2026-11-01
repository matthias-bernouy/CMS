import type { ErrorMessageKey } from "./catalogue";

/** These are provider copy choices, not additional contract error codes. */
export function contextualMessage(contractId: string, capabilityId: string, code: string): ErrorMessageKey | undefined {
    if (code === "CANNOT_REMOVE_SELF") {
        return capabilityId === "delete-user" ? "self.delete" : "self.administrator";
    }
    if (code === "REVISION_CONFLICT") {
        if (contractId === "ulvia.provider.connections") {
            return "connection.changed";
        }
        if (capabilityId.startsWith("pages.")) {
            return "page.changed";
        }
        if (capabilityId.startsWith("site-blocs.")) {
            return "bloc.changed";
        }
    }
    if (code === "INVALID_INPUT") {
        if (capabilityId.startsWith("examples.")) {
            return "example.request";
        }
        if (contractId === "ulvia.cms.emailer.smtp" && capabilityId.startsWith("smtp.configuration.")) {
            return "smtp.invalid";
        }
        if (contractId === "ulvia.provider.connections") {
            return "connection.invalid";
        }
    }
    if (code !== "NOT_FOUND") {
        return undefined;
    }
    if (capabilityId.startsWith("pages.")) {
        return "page.not_found";
    }
    if (capabilityId.startsWith("site-blocs.")) {
        return "bloc.not_found";
    }
    if (capabilityId.startsWith("theme.")) {
        return "theme.not_found";
    }
    if (capabilityId.startsWith("localization.")) {
        return "text.not_found";
    }
    if (contractId === "ulvia.cms.access") {
        return "user.not_found";
    }
    if (contractId === "ulvia.cms.observability") {
        return "log.not_found";
    }
    if (capabilityId.includes("namespace.keys")) {
        return "key.not_found";
    }
    if (capabilityId.startsWith("namespace.")) {
        return "namespace.not_found";
    }
    if (capabilityId.startsWith("secrets.")) {
        return "secret.not_found";
    }
    if (capabilityId.includes("upload.")) {
        return "upload.not_found";
    }
    if (capabilityId.startsWith("representations.")) {
        return "representation.not_found";
    }
    if (contractId === "ulvia.cms.files") {
        return "file.not_found";
    }
    if (capabilityId.includes("operation")) {
        return "operation.not_found";
    }
    if (capabilityId.includes("upgrade")) {
        return "upgrade.not_found";
    }
    if (capabilityId.includes("provider")) {
        return "provider.not_found";
    }
    if (capabilityId.includes("collection")) {
        return "collection.not_found";
    }
    if (capabilityId.includes("contract")) {
        return "contract.not_found";
    }
    return undefined;
}
