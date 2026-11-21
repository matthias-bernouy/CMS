import type { AccountEmailConfigurationStore } from "./interfaces";
import type { AccountEmailConfiguration } from "./schemas";
export class MemoryAccountEmailConfigurationStore implements AccountEmailConfigurationStore {
    private value: AccountEmailConfiguration | null = null;
    async read() {
        return structuredClone(this.value);
    }
    async initialize(value: AccountEmailConfiguration) {
        this.value ??= structuredClone(value);
    }
    async replace(value: AccountEmailConfiguration, expectedRevision: number) {
        if (this.value?.revision !== expectedRevision) {
            return false;
        }
        this.value = structuredClone(value);
        return true;
    }
}
