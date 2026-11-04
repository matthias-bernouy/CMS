import type { Collection } from "mongodb";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { defaultSystem } from "cms-content/settings/core/system";
import { validateSettingsPatch } from "cms-content/settings/core/validation";
import { SYSTEM_ID, type SystemDoc } from "../documents";

/** Initialize only an empty site; existing records must use the current format. */
export async function readSystemDocument(systems: Collection<SystemDoc>): Promise<SystemDoc> {
    let document = await systems.findOne({ _id: SYSTEM_ID });
    if (!document) {
        try {
            await systems.insertOne({
                _id: SYSTEM_ID,
                ...defaultSystem(),
                settingsRevision: 0,
                activePageWrites: 0,
                activePageWritePermits: {},
            });
        } catch (error) {
            if ((error as { code?: unknown } | null)?.code !== 11000) {
                throw error;
            }
        }
        document = await systems.findOne({ _id: SYSTEM_ID });
    }
    if (!document) {
        throw new Error("System settings are unavailable.");
    }
    if (
        !Number.isSafeInteger(document.settingsRevision) ||
        document.settingsRevision < 0 ||
        !Number.isSafeInteger(document.activePageWrites) ||
        document.activePageWrites < 0 ||
        !document.activePageWritePermits ||
        typeof document.activePageWritePermits !== "object" ||
        Array.isArray(document.activePageWritePermits)
    ) {
        throw new TypeError("Stored system requires current revision and write-permit metadata");
    }
    if (document.routeMigration && !(document.routeMigration.expiresAt instanceof Date)) {
        throw new TypeError("Stored route maintenance requires an explicit lease expiry");
    }
    systemFromDocument(document);
    return document;
}

export function systemFromDocument(document: SystemDoc): TSystem {
    const {
        _id: _id,
        routeMigration,
        settingsRevision: _revision,
        activePageWrites: _writes,
        activePageWritePermits: _permits,
        pageDeletionLock: _deletionLock,
        ...stored
    } = document;
    const defaults = defaultSystem();
    requireRecord(stored, defaults, "system");
    requireRecord(stored.site, defaults.site, "site");
    requireRecord(stored.site.organization, defaults.site.organization, "site.organization");
    requireRecord(stored.site.organization.address, defaults.site.organization.address, "site.organization.address");
    const system = validateSettingsPatch(stored) as TSystem;
    return routeMigration ? { ...system, pageRoutesUpdating: true } : system;
}

function requireRecord(value: unknown, shape: object, path: string): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`Stored ${path} requires an object`);
    }
    const record = value as Record<string, unknown>;
    for (const field of Object.keys(shape)) {
        if (!Object.hasOwn(record, field) || record[field] === undefined) {
            throw new TypeError(`Stored ${path} requires ${field}`);
        }
        const expected = (shape as Record<string, unknown>)[field];
        const actual = record[field];
        if (
            expected !== null &&
            (typeof actual !== typeof expected ||
                (Array.isArray(expected) && !Array.isArray(actual)) ||
                (typeof expected === "object" && !Array.isArray(expected) && (!actual || Array.isArray(actual))))
        ) {
            throw new TypeError(`Stored ${path}.${field} has an invalid type`);
        }
    }
    for (const field of Object.keys(record)) {
        if (!Object.hasOwn(shape, field)) {
            throw new TypeError(`Stored ${path} has unsupported field ${field}`);
        }
    }
}
