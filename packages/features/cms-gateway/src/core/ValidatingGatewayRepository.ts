import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { Provider } from "../interfaces/Gateway";
import { validateProvider } from "./validateProvider";
import { GatewayValidationError } from "./errors";

/**
 * Decorator that runs `validateProvider` on every write before delegating — the
 * unbypassable barrier so no writer (admin API, seed, CLI, …) can store an
 * invalid provider. Reads and deletes pass straight through.
 *
 *   `new ValidatingGatewayRepository(new MongoGatewayRepository(db))`
 */
export class ValidatingGatewayRepository implements GatewayRepository {
    constructor(private readonly inner: GatewayRepository) {}

    async createProvider(provider: Provider): Promise<Provider> {
        this.validate(provider);
        return this.inner.createProvider(provider);
    }

    async updateProvider(provider: Provider): Promise<Provider | null> {
        this.validate(provider);
        return this.inner.updateProvider(provider);
    }

    private validate(provider: Provider): void {
        const errors = validateProvider(provider);
        if (errors.length) throw new GatewayValidationError("provider", errors.join("; "));
    }

    deleteProvider(urn: string)  { return this.inner.deleteProvider(urn); }
    getProvider(urn: string)     { return this.inner.getProvider(urn); }
    getAllProviders()            { return this.inner.getAllProviders(); }
    getEndpoint(urn: string)     { return this.inner.getEndpoint(urn); }
}
