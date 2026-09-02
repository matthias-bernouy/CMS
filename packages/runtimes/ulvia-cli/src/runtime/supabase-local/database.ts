import { SQL } from "bun";

export interface LocalSupabaseDatabase {
    query(source: string): Promise<unknown[]>;
    close(): Promise<void>;
}

export class BunLocalSupabaseDatabase implements LocalSupabaseDatabase {
    private readonly connection: SQL;

    constructor(databaseUrl: string) {
        this.connection = new SQL(databaseUrl, { max: 1 });
    }

    async query(source: string): Promise<unknown[]> {
        try {
            const rows = await this.connection.unsafe(source);
            return jsonValue([...rows]) as unknown[];
        } catch (error) {
            await this.connection.unsafe("ROLLBACK").catch(() => undefined);
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.connection.close();
    }
}

function jsonValue(value: unknown): unknown {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(jsonValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
    }
    return value;
}
