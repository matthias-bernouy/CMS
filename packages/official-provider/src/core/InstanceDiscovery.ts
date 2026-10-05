import type {
    OfficialCmsInstanceProjection,
    OfficialCmsInstanceRecord,
    OfficialCmsInstanceRegistration,
    OfficialCmsInstanceRegistry,
} from "./instanceRecords";
import { requireInstanceIdentifier, validateRegistration } from "./instanceRecords";

export class OfficialCmsInstanceDiscovery {
    constructor(
        private readonly registry: OfficialCmsInstanceRegistry,
        private readonly currentId: string,
        private readonly probe: (instance: OfficialCmsInstanceRecord) => Promise<boolean>,
        private readonly now: () => Date = () => new Date(),
        private readonly maxObservationAgeMs = 15_000,
    ) {
        requireInstanceIdentifier(currentId, "current instance ID");
        if (!Number.isSafeInteger(maxObservationAgeMs) || maxObservationAgeMs < 0) {
            throw new TypeError("Instance observation age must be a non-negative integer");
        }
    }

    registerCurrent(input: OfficialCmsInstanceRegistration): Promise<OfficialCmsInstanceRecord> {
        if (input.id !== this.currentId) {
            throw new TypeError("Current instance registration does not match the configured instance");
        }
        return this.registry.register(validateRegistration(input), this.now().toISOString());
    }

    async current(): Promise<OfficialCmsInstanceProjection | null> {
        const current = await this.registry.get(this.currentId);
        return current ? this.project(await this.refresh(current)) : null;
    }

    async list(
        cursor: string | undefined,
        limit: number,
    ): Promise<{
        items: readonly OfficialCmsInstanceProjection[];
        nextCursor?: string;
    }> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
            throw new TypeError("Instance page limit must be between 1 and 50");
        }
        const afterId = cursor === undefined ? undefined : decodeCursor(cursor);
        const page = await this.registry.list(afterId, limit);
        const items = await Promise.all(page.items.map(async (item) => this.project(await this.refresh(item))));
        return Object.freeze({
            items: Object.freeze(items),
            ...(page.nextAfterId ? { nextCursor: encodeCursor(page.nextAfterId) } : {}),
        });
    }

    private async refresh(instance: OfficialCmsInstanceRecord): Promise<OfficialCmsInstanceRecord> {
        const now = this.now();
        if (instance.lastReadyAt && now.getTime() - Date.parse(instance.lastReadyAt) <= this.maxObservationAgeMs) {
            return instance;
        }
        try {
            return (await this.probe(instance))
                ? await this.registry.markReady(instance.id, now.toISOString())
                : instance;
        } catch {
            return instance;
        }
    }

    private project(instance: OfficialCmsInstanceRecord): OfficialCmsInstanceProjection {
        const lastReadyAt = instance.lastReadyAt;
        const fresh =
            lastReadyAt !== undefined && this.now().getTime() - Date.parse(lastReadyAt) <= this.maxObservationAgeMs;
        return Object.freeze({
            id: instance.id,
            label: instance.label,
            lifecycleState: instance.lifecycleState,
            availability: fresh ? "ready" : "unavailable",
            coreVersion: instance.coreVersion,
            ...(lastReadyAt ? { observedAt: lastReadyAt } : {}),
            contracts: instance.contracts,
        });
    }
}

function encodeCursor(id: string): string {
    return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
    if (!/^[A-Za-z0-9_-]{1,256}$/u.test(cursor)) {
        throw new TypeError("Invalid instance cursor");
    }
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    requireInstanceIdentifier(id, "instance cursor");
    if (encodeCursor(id) !== cursor) {
        throw new TypeError("Invalid instance cursor");
    }
    return id;
}
