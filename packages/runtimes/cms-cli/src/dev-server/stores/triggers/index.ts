import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    DuplicateTriggerError,
    initializeSchedule,
    matchesEndpointTriggerScope,
    type ScheduledTriggerClaim,
    type ScheduledTriggerClaimRequest,
    type ScheduledTriggerCompletion,
    type TriggerLastRun,
    type TriggerRecord,
    type TriggerRepository,
} from "@bernouy/cms-triggers";
import { withFileLock } from "./lock";
import { claimDueTriggers, claimTriggerNow, completeTrigger } from "./scheduled";
import { isTrigger, publicTrigger, storedTrigger, type StoredTrigger } from "./storage";

const GENERATED_TRIGGERS_FILE = ".p9r/generated/triggers.json";

export class LocalFsTriggerRepository implements TriggerRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_TRIGGERS_FILE);
    }

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        return this.mutate(async (triggers) => {
            if (triggers.some((candidate) => candidate.id === trigger.id)) {
                throw new DuplicateTriggerError(trigger.id);
            }
            const initialized = initializeSchedule(trigger);
            triggers.push(storedTrigger(initialized));
            return structuredClone(initialized);
        });
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        return this.mutate(async (triggers) => {
            const index = triggers.findIndex((candidate) => candidate.id === trigger.id);
            if (index < 0) {
                return null;
            }
            const initialized = initializeSchedule(trigger);
            triggers[index] = storedTrigger(initialized, triggers[index]);
            return structuredClone(initialized);
        });
    }

    async deleteTrigger(id: string): Promise<boolean> {
        return this.mutate(async (triggers) => {
            const index = triggers.findIndex((trigger) => trigger.id === id);
            if (index < 0) {
                return false;
            }
            triggers.splice(index, 1);
            return true;
        });
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        const found = (await this.readAll()).find((trigger) => trigger.id === id);
        return found ? publicTrigger(found) : null;
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        return (await this.readAll()).map(publicTrigger);
    }

    async findEndpointTriggers(source: string, endpoint: string): Promise<TriggerRecord[]> {
        return (await this.readAll())
            .filter((trigger) => matchesEndpointTriggerScope(trigger, source, endpoint))
            .map(publicTrigger);
    }

    async claimDueScheduledTriggers(request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim[]> {
        return this.mutate(async (triggers) => claimDueTriggers(triggers, request));
    }

    async claimScheduledTriggerNow(
        id: string,
        request: ScheduledTriggerClaimRequest,
    ): Promise<ScheduledTriggerClaim | null> {
        return this.mutate(async (triggers) => claimTriggerNow(triggers, id, request));
    }

    async completeScheduledTrigger(completion: ScheduledTriggerCompletion): Promise<TriggerRecord | null> {
        return this.mutate(async (triggers) => completeTrigger(triggers, completion));
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        return this.mutate(async (triggers) => {
            const index = triggers.findIndex((trigger) => trigger.id === id);
            if (index < 0) {
                return null;
            }
            const previous = triggers[index]!;
            const base = { ...publicTrigger(previous), enabled };
            const reset =
                enabled && !previous.enabled && previous.event.kind === "schedule" && !previous.scheduleState?.running;
            const initialized = initializeSchedule(reset ? withoutScheduleState(base) : base);
            triggers[index] = storedTrigger(initialized, previous);
            return structuredClone(initialized);
        });
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        return this.mutate(async (triggers) => {
            const index = triggers.findIndex((trigger) => trigger.id === id);
            if (index < 0) {
                return null;
            }
            triggers[index] = { ...triggers[index]!, lastRun: structuredClone(lastRun) };
            return publicTrigger(triggers[index]!);
        });
    }

    private async readAll(): Promise<StoredTrigger[]> {
        if (!existsSync(this.file)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isTrigger).map((trigger) => structuredClone(trigger));
    }

    private async writeAll(triggers: StoredTrigger[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        const sorted = [...triggers].sort((left, right) => left.id.localeCompare(right.id));
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, `${JSON.stringify(sorted, null, 4)}\n`, "utf-8");
        await rename(temporary, this.file);
    }

    private async mutate<T>(operation: (triggers: StoredTrigger[]) => Promise<T>): Promise<T> {
        return withFileLock(this.file, async () => {
            const triggers = await this.readAll();
            const result = await operation(triggers);
            await this.writeAll(triggers);
            return result;
        });
    }
}

function withoutScheduleState(trigger: TriggerRecord): TriggerRecord {
    const { scheduleState: _scheduleState, ...rest } = trigger;
    return rest;
}
