import type { ReleaseDigest } from "@bernouy/cms-repository/contracts";

const IDENTIFIER = /^[a-z0-9](?:[a-z0-9._-]{0,94}[a-z0-9])?$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const MAX_INSTANCES = 1024;

export type OfficialCmsInstanceContract = Readonly<{
    contractId: string;
    version: string;
    digest: ReleaseDigest;
}>;

export type OfficialCmsInstanceRegistration = Readonly<{
    id: string;
    label: string;
    lifecycleState: "running" | "maintenance" | "stopped";
    coreVersion: string;
    contracts: readonly OfficialCmsInstanceContract[];
    healthUrl: string;
}>;

export type OfficialCmsInstanceRecord = OfficialCmsInstanceRegistration &
    Readonly<{
        registeredAt: string;
        updatedAt: string;
        lastReadyAt?: string;
    }>;

export type OfficialCmsInstancePage = Readonly<{
    items: readonly OfficialCmsInstanceRecord[];
    nextAfterId?: string;
}>;

export interface OfficialCmsInstanceRegistry {
    register(input: OfficialCmsInstanceRegistration, now: string): Promise<OfficialCmsInstanceRecord>;
    get(id: string): Promise<OfficialCmsInstanceRecord | null>;
    list(afterId: string | undefined, limit: number): Promise<OfficialCmsInstancePage>;
    markReady(id: string, observedAt: string): Promise<OfficialCmsInstanceRecord>;
}

export type OfficialCmsInstanceProjection = Readonly<{
    id: string;
    label: string;
    lifecycleState: OfficialCmsInstanceRegistration["lifecycleState"];
    availability: "ready" | "unavailable";
    coreVersion: string;
    observedAt?: string;
    contracts: readonly OfficialCmsInstanceContract[];
}>;

export function validateRegistration(input: OfficialCmsInstanceRegistration): OfficialCmsInstanceRegistration {
    requireInstanceIdentifier(input.id, "instance ID");
    if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 160) {
        throw new TypeError("Instance label must contain between 1 and 160 characters");
    }
    if (!(["running", "maintenance", "stopped"] as const).includes(input.lifecycleState)) {
        throw new TypeError("Invalid instance lifecycle state");
    }
    if (typeof input.coreVersion !== "string" || !VERSION.test(input.coreVersion) || input.coreVersion.length > 64) {
        throw new TypeError("Core version must be a bounded semantic version");
    }
    const health = new URL(input.healthUrl);
    if (health.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(health.hostname)) {
        throw new TypeError("Local Core health URL must use loopback HTTP");
    }
    if (!Array.isArray(input.contracts) || input.contracts.length > 256) {
        throw new TypeError("A local Core cannot advertise more than 256 contracts");
    }
    const contracts = input.contracts.map((contract) => validateContract(contract));
    if (new Set(contracts.map(({ contractId }) => contractId)).size !== contracts.length) {
        throw new TypeError("Core contracts must be unique by ID");
    }
    return Object.freeze({
        id: input.id,
        label: input.label.trim(),
        lifecycleState: input.lifecycleState,
        coreVersion: input.coreVersion,
        contracts: Object.freeze(contracts.sort((left, right) => left.contractId.localeCompare(right.contractId))),
        healthUrl: health.href,
    });
}

export function validateStoredInstances(value: unknown): readonly OfficialCmsInstanceRecord[] {
    if (!Array.isArray(value) || value.length > MAX_INSTANCES) {
        throw new Error("Corrupt official provider instance registry");
    }
    const records = value.map((item) => validateStoredRecord(item));
    if (new Set(records.map(({ id }) => id)).size !== records.length) {
        throw new Error("Corrupt official provider instance registry");
    }
    return Object.freeze(records.sort((left, right) => left.id.localeCompare(right.id)));
}

export function requireInstanceIdentifier(value: string, label: string): void {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError(`Invalid ${label}`);
    }
}

function validateContract(contract: OfficialCmsInstanceContract): OfficialCmsInstanceContract {
    requireInstanceIdentifier(contract.contractId, "contract ID");
    if (contract.contractId.startsWith("ulvia.provider.")) {
        throw new TypeError("Provider lifecycle contracts cannot be advertised as Core contracts");
    }
    if (!VERSION.test(contract.version) || !/^sha256:[0-9a-f]{64}$/u.test(contract.digest)) {
        throw new TypeError("Core contracts require an exact semantic version and digest");
    }
    return Object.freeze({ ...contract });
}

function validateStoredRecord(value: unknown): OfficialCmsInstanceRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Corrupt official provider instance registry");
    }
    const source = value as Partial<OfficialCmsInstanceRecord>;
    const registration = validateRegistration(source as OfficialCmsInstanceRegistration);
    for (const timestamp of [source.registeredAt, source.updatedAt, source.lastReadyAt]) {
        if (timestamp !== undefined && (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)))) {
            throw new Error("Corrupt official provider instance registry");
        }
    }
    if (!source.registeredAt || !source.updatedAt) {
        throw new Error("Corrupt official provider instance registry");
    }
    return Object.freeze({
        ...registration,
        registeredAt: source.registeredAt,
        updatedAt: source.updatedAt,
        ...(source.lastReadyAt ? { lastReadyAt: source.lastReadyAt } : {}),
    });
}
