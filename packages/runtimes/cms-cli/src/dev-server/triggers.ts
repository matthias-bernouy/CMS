import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    DuplicateTriggerError,
    matchesEndpointTriggerScope,
    type TriggerLastRun,
    type TriggerRecord,
    type TriggerRepository,
} from "@bernouy/cms-triggers";

const GENERATED_TRIGGERS_FILE = ".p9r/generated/triggers.json";

export class LocalFsTriggerRepository implements TriggerRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_TRIGGERS_FILE);
    }

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        const triggers = await this.readAll();
        if (triggers.some(candidate => candidate.id === trigger.id)) {
            throw new DuplicateTriggerError(trigger.id);
        }
        triggers.push(structuredClone(trigger));
        await this.writeAll(triggers);
        return structuredClone(trigger);
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        const triggers = await this.readAll();
        const index = triggers.findIndex(candidate => candidate.id === trigger.id);
        if (index < 0) return null;
        triggers[index] = structuredClone(trigger);
        await this.writeAll(triggers);
        return structuredClone(trigger);
    }

    async deleteTrigger(id: string): Promise<boolean> {
        const triggers = await this.readAll();
        const next = triggers.filter(trigger => trigger.id !== id);
        if (next.length === triggers.length) return false;
        await this.writeAll(next);
        return true;
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        const found = (await this.readAll()).find(trigger => trigger.id === id);
        return found ? structuredClone(found) : null;
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        return (await this.readAll()).map(trigger => structuredClone(trigger));
    }

    async findEndpointTriggers(source: string, endpoint: string): Promise<TriggerRecord[]> {
        return (await this.readAll())
            .filter(trigger => matchesEndpointTriggerScope(trigger, source, endpoint))
            .map(trigger => structuredClone(trigger));
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        const triggers = await this.readAll();
        const index = triggers.findIndex(trigger => trigger.id === id);
        if (index < 0) return null;
        triggers[index] = { ...triggers[index]!, enabled };
        await this.writeAll(triggers);
        return structuredClone(triggers[index]!);
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        const triggers = await this.readAll();
        const index = triggers.findIndex(trigger => trigger.id === id);
        if (index < 0) return null;
        triggers[index] = { ...triggers[index]!, lastRun: structuredClone(lastRun) };
        await this.writeAll(triggers);
        return structuredClone(triggers[index]!);
    }

    private async readAll(): Promise<TriggerRecord[]> {
        if (!existsSync(this.file)) return [];
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isTrigger).map(trigger => structuredClone(trigger));
    }

    private async writeAll(triggers: TriggerRecord[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        const sorted = [...triggers].sort((left, right) => left.id.localeCompare(right.id));
        await writeFile(this.file, `${JSON.stringify(sorted, null, 4)}\n`, "utf-8");
    }
}

function isTrigger(value: unknown): value is TriggerRecord {
    return !!value
        && typeof value === "object"
        && !Array.isArray(value)
        && typeof (value as { id?: unknown }).id === "string"
        && typeof (value as { enabled?: unknown }).enabled === "boolean"
        && typeof (value as { event?: { phase?: unknown } }).event?.phase === "string"
        && typeof (value as { function?: { id?: unknown } }).function?.id === "string";
}
