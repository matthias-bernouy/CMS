import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { REQUEST_CONTEXT_HEADER, decodeRequestContext } from "@bernouy/cms-gateway/protocol";
import { createProviderContractRelay } from "@bernouy/cms-gateway/provider/server";
import { errorMessage, isOfficialContract } from "./localize";
import { messageLanguage } from "./locale";

type Routes = Parameters<typeof createProviderContractRelay>[0];

/** The SDK logs unexpected failures; the official surface adds safe copy afterwards. */
export async function localizeFailureResponse(
    response: Response | null,
    request: Request,
    claims: ProviderInvocationClaims,
    routes: Routes,
): Promise<Response | null> {
    if (!response || response.status < 400 || response.headers.has("content-language")) {
        return response;
    }
    const route = routes.find(
        (item) =>
            item.contractId === claims.contractId &&
            item.contractVersion === claims.contractVersion &&
            item.capability.id === claims.capabilityId,
    );
    if (!route || !isOfficialContract(route.contractId)) {
        return response;
    }
    let preference = request.headers.get("accept-language");
    try {
        const metadata = decodeRequestContext(request.headers.get(REQUEST_CONTEXT_HEADER));
        if (metadata) {
            preference = metadata.headers["accept-language"] ?? null;
        }
    } catch {
        /* Malformed metadata is handled by the SDK. */
    }
    const language = messageLanguage(preference);
    if (request.method === "HEAD") {
        const code = response.headers.get("x-ulvia-error-code");
        if (code && route.capability.errors.some((error) => error.code === code)) {
            response.headers.set("content-language", language);
            response.headers.set("cache-control", "no-store");
        }
        return response;
    }
    if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
        return response;
    }
    const envelope = await response.json();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    const code = envelope?.error?.code;
    const definition = route.capability.errors.find((error) => error.code === code);
    if (
        envelope?.error?.output !== undefined ||
        !definition?.output ||
        route.capability.binding.response.errorStatuses[code] !== response.status
    ) {
        return Response.json(envelope, { status: response.status, headers });
    }
    headers.set("content-language", language);
    headers.set("cache-control", "no-store");
    return Response.json(
        { error: { code, output: { message: errorMessage(claims.contractId, claims.capabilityId, code, language) } } },
        { status: response.status, headers },
    );
}
