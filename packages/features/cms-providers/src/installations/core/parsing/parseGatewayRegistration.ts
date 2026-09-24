import type {
    ProviderGatewayRegistrationRequest,
    ProviderGatewayRegistrationResponse,
} from "cms-providers/installations/interfaces/ProviderConnection";
import { expectString, rejectUnknownKeys, type UnknownRecord } from "cms-providers/manifests/core/values";
import { parseIdentifier } from "cms-providers/manifests/core/parsing/identifiers";
import { ProviderInstallationValidationError } from "../errors";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "../limits";
import { parseInstallationDocument, parseInstallationJson } from "./documents";
import { parseEndpoint, parseOpaqueId } from "./fields";

/** Sensitive bootstrap DTO. Never return it in an admin response or persist/log it. */
export function parseProviderGatewayRegistrationRequest(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderGatewayRegistrationRequest {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(record, ["protocol", "installationId", "gatewayUrl", "gatewayToken"], "$");
        const gatewayToken = expectString(record.gatewayToken, "$.gatewayToken", 4096);
        if (!/^[A-Za-z0-9._~+/-]+=*$/.test(gatewayToken)) {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "must be a bearer token",
                "$.gatewayToken",
            );
        }
        const gatewayUrl = parseGatewayUrl(record.gatewayUrl);
        return { ...parseIdentity(record), gatewayUrl, gatewayToken };
    });
}

export function parseProviderGatewayRegistrationResponse(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderGatewayRegistrationResponse {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(record, ["protocol", "installationId", "providerId", "accountId"], "$");
        return {
            ...parseIdentity(record),
            providerId: parseIdentifier(record.providerId, "$.providerId", 96),
            accountId: parseOpaqueId(record.accountId, "$.accountId"),
        };
    });
}

export function parseProviderGatewayRegistrationRequestJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderGatewayRegistrationRequest {
    return parseInstallationJson(input, limits, (value) => parseProviderGatewayRegistrationRequest(value, limits));
}

export function parseProviderGatewayRegistrationResponseJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderGatewayRegistrationResponse {
    return parseInstallationJson(input, limits, (value) => parseProviderGatewayRegistrationResponse(value, limits));
}

function parseIdentity(record: UnknownRecord) {
    if (record.protocol !== "ulvia-provider/v1") {
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "must be ulvia-provider/v1",
            "$.protocol",
        );
    }
    return {
        protocol: "ulvia-provider/v1" as const,
        installationId: parseOpaqueId(record.installationId, "$.installationId"),
    };
}

function parseGatewayUrl(value: unknown): string {
    const address = expectString(value, "$.gatewayUrl", 2048);
    let url: URL;
    try {
        url = new URL(address);
    } catch {
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "must be an absolute gateway URL",
            "$.gatewayUrl",
        );
    }
    parseEndpoint(url.origin, "$.gatewayUrl");
    if (
        url.href !== address ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        address.includes("?") ||
        address.includes("#")
    ) {
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "gateway URL must be canonical without credentials, query or fragment",
            "$.gatewayUrl",
        );
    }
    return address;
}
