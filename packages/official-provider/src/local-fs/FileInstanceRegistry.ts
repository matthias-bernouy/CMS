import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
    OfficialCmsInstancePage,
    OfficialCmsInstanceRecord,
    OfficialCmsInstanceRegistration,
    OfficialCmsInstanceRegistry,
} from "../core/instanceRecords";
import { validateRegistration, validateStoredInstances } from "../core/instanceRecords";

export class FileInstanceRegistry implements OfficialCmsInstanceRegistry {
    private tail = Promise.resolve();

    constructor(private readonly path: string) {}

    register(input: OfficialCmsInstanceRegistration, now: string): Promise<OfficialCmsInstanceRecord> {
        return this.write(async (records) => {
            const registration = validateRegistration(input);
            const existing = records.find((record) => record.id === registration.id);
            const record = Object.freeze({
                ...registration,
                registeredAt: existing?.registeredAt ?? now,
                updatedAt: now,
                ...(existing?.lastReadyAt && sameRegistration(existing, registration)
                    ? { lastReadyAt: existing.lastReadyAt }
                    : {}),
            });
            return { records: [...records.filter(({ id }) => id !== record.id), record], result: record };
        });
    }

    async get(id: string): Promise<OfficialCmsInstanceRecord | null> {
        return (await this.read()).find((record) => record.id === id) ?? null;
    }

    async list(afterId: string | undefined, limit: number): Promise<OfficialCmsInstancePage> {
        const records = (await this.read()).filter((record) => afterId === undefined || record.id > afterId);
        const items = records.slice(0, limit);
        return Object.freeze({
            items: Object.freeze(items),
            ...(records.length > limit ? { nextAfterId: items.at(-1)!.id } : {}),
        });
    }

    markReady(id: string, observedAt: string): Promise<OfficialCmsInstanceRecord> {
        return this.write(async (records) => {
            const current = records.find((record) => record.id === id);
            if (!current) {
                throw new Error("Official provider instance is unavailable");
            }
            const record = Object.freeze({ ...current, updatedAt: observedAt, lastReadyAt: observedAt });
            return { records: [...records.filter((item) => item.id !== id), record], result: record };
        });
    }

    private async read(): Promise<readonly OfficialCmsInstanceRecord[]> {
        const source = await readFile(this.path, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        return source === null ? [] : validateStoredInstances(JSON.parse(source));
    }

    private async write<T>(
        mutation: (records: readonly OfficialCmsInstanceRecord[]) => Promise<{
            records: readonly OfficialCmsInstanceRecord[];
            result: T;
        }>,
    ): Promise<T> {
        const operation = this.tail.then(async () => {
            const { records, result } = await mutation(await this.read());
            const normalized = validateStoredInstances(records);
            await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
            const temporary = `${this.path}.${crypto.randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify(normalized), { flag: "wx", mode: 0o600 });
                await rename(temporary, this.path);
            } finally {
                await rm(temporary, { force: true });
            }
            return result;
        });
        this.tail = operation.then(
            () => undefined,
            () => undefined,
        );
        return operation;
    }
}

function sameRegistration(left: OfficialCmsInstanceRegistration, right: OfficialCmsInstanceRegistration): boolean {
    return (
        left.id === right.id &&
        left.label === right.label &&
        left.lifecycleState === right.lifecycleState &&
        left.coreVersion === right.coreVersion &&
        left.healthUrl === right.healthUrl &&
        JSON.stringify(left.contracts) === JSON.stringify(right.contracts)
    );
}
