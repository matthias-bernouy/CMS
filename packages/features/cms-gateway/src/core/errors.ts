/** Thrown when a provider write breaks a gateway-domain rule. Carries `.status`
 *  so any HTTP surface maps it to a 400 without importing surface errors. */
export class GatewayValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "GatewayValidationError";
    }
}
