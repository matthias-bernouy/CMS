import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import { ERROR_MESSAGES } from "./catalogue/index";
import type { ErrorMessageKey } from "./catalogue/index";
import { contextualMessage } from "./context";
import { failureReason } from "./failure";
import type { FailureReason } from "./failure";
import { messageLanguage } from "./locale";
import type { MessageLanguage } from "./locale";

export function isOfficialContract(id: string): boolean {
    return [
        "ulvia/repository",
        "ulvia/cms.access",
        "ulvia/cms.content",
        "ulvia/cms.emailer",
        "ulvia/cms.emailer.smtp",
        "ulvia/cms.files",
        "ulvia/cms.installations",
        "ulvia/cms.observability",
        "ulvia/cms.authoring",
        "ulvia/cms.secrets",
        "ulvia/provider.connections",
        "ulvia/provider.cms-instances",
    ].includes(id);
}

export function errorMessage(
    contractId: string,
    capabilityId: string,
    code: string,
    language: MessageLanguage,
    reason?: FailureReason,
): string {
    const contextual = contextualMessage(contractId, capabilityId, code);
    const selected = reason?.code ?? contextual ?? code;
    const key = Object.hasOwn(ERROR_MESSAGES, selected)
        ? (selected as ErrorMessageKey)
        : (contextual ?? (Object.hasOwn(ERROR_MESSAGES, code) ? (code as ErrorMessageKey) : "CORE_UNAVAILABLE"));
    const template = ERROR_MESSAGES[key][language === "fr" ? 1 : 0];
    const parameters = reason?.parameters ?? {};
    let complete = true;
    const message = template.replace(/\{([a-zA-Z]+)\}/gu, (_placeholder, name: string) => {
        const value = Object.hasOwn(parameters, name) ? parameters[name] : undefined;
        if (
            (typeof value !== "string" && typeof value !== "number") ||
            (typeof value === "number" && !Number.isFinite(value))
        ) {
            complete = false;
            return "";
        }
        return String(value)
            .replace(/[\x00-\x1f\x7f]/gu, " ")
            .slice(0, 256)
            .toWellFormed();
    });
    if (!complete || message.length > 2048) {
        return errorMessage(contractId, capabilityId, code, language);
    }
    return message;
}

export function localizeOfficialError(
    error: ProviderCapabilityDispatchError,
    contractId: string,
    capabilityId: string,
    context: ProviderCapabilityInvocationContext,
): ProviderCapabilityDispatchError {
    if (!isOfficialContract(contractId) || error.output !== undefined) {
        return error;
    }
    const language = messageLanguage(
        context.http?.headers.get("accept-language") ?? context.requestContext?.headers["accept-language"],
    );
    return new ProviderCapabilityDispatchError(
        error.code,
        error.status,
        error.code,
        { ...error.responseHeaders, "content-language": language },
        { message: errorMessage(contractId, capabilityId, error.code, language, failureReason(error)) },
        error.reason ?? contextualMessage(contractId, capabilityId, error.code),
    );
}
