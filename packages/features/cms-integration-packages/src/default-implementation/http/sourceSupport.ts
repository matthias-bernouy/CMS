import { IntegrationPackageRepositoryContractError, IntegrationPackageRepositoryUnavailableError } from "./errors";

export function assertSuccessfulPackageStatus(response: Response): void {
    if (response.ok) {
        return;
    }
    if (response.status === 429 || response.status >= 500) {
        throw new IntegrationPackageRepositoryUnavailableError();
    }
    throw new IntegrationPackageRepositoryContractError();
}

export function integrationPackageEndpoint(value: string): URL {
    const base = new URL(value);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
        throw new TypeError("Integration package repository URL must use HTTP or HTTPS");
    }
    if (base.username || base.password) {
        throw new TypeError("Integration package repository URL must not contain credentials");
    }
    base.search = "";
    base.hash = "";
    if (!base.pathname.endsWith("/")) {
        base.pathname = `${base.pathname}/`;
    }
    return new URL("api/integrations/package", base);
}

export function parsePackageTimeout(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
        throw new RangeError("Integration package repository timeout must be a positive 32-bit integer");
    }
    return value;
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
