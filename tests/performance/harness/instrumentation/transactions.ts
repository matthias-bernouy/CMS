import type { MongoTransactionWitness } from "../../capabilities/types";

type Row = Readonly<Record<string, unknown>>;
type Command = Readonly<{ requestId: number; databaseName: string; commandName: string }>;
type Context = Readonly<{ traceId?: string; spanId?: string }>;
type Pending = Command & Context;

export function isTransactionControl(database: unknown, operation: unknown): boolean {
    return database === "admin" && (operation === "commitTransaction" || operation === "abortTransaction");
}

/** Transaction controls have no collection profiler row; require a correlated terminal driver event. */
export function transactionWitness(command: Row, rows: readonly Row[]): MongoTransactionWitness | undefined {
    if (
        !isTransactionControl(command.database, command.operation) ||
        !Number.isSafeInteger(command.requestId) ||
        Number(command.requestId) < 0 ||
        typeof command.traceId !== "string" ||
        !command.traceId
    ) {
        return undefined;
    }
    const matching = rows.filter(
        (row) =>
            row.kind === "mongo-transaction" &&
            row.requestId === command.requestId &&
            row.database === command.database &&
            row.operation === command.operation &&
            row.traceId === command.traceId &&
            row.spanId === command.spanId,
    );
    const row = matching[0];
    if (
        matching.length !== 1 ||
        !row ||
        !["succeeded", "failed"].includes(String(row.outcome)) ||
        typeof row.durationMs !== "number" ||
        !Number.isFinite(row.durationMs) ||
        row.durationMs < 0
    ) {
        return undefined;
    }
    return {
        database: "admin",
        operation: command.operation as MongoTransactionWitness["operation"],
        traceId: command.traceId,
        requestId: Number(command.requestId),
        ...(typeof command.spanId === "string" ? { spanId: command.spanId } : {}),
        durationMs: row.durationMs,
        outcome: row.outcome as MongoTransactionWitness["outcome"],
    };
}

/** Per-client bounded correlation retains only command metadata, never replies or failure messages. */
export function transactionProbe(emit: (row: Row) => void, limit = 256) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) {
        throw new Error("Invalid transaction probe bound");
    }
    const pending = new Map<number, Pending>();
    const overflow = (context: Context) =>
        emit({ kind: "overflow", component: "mongo-transaction", traceId: context.traceId, spanId: context.spanId });
    return {
        started(command: Command, context: Context) {
            if (!isTransactionControl(command.databaseName, command.commandName) || !context.traceId) {
                return;
            }
            const previous = pending.get(command.requestId);
            if (previous) {
                pending.delete(command.requestId);
                overflow(previous);
                overflow(context);
                return;
            }
            if (!Number.isSafeInteger(command.requestId) || command.requestId < 0 || pending.size >= limit) {
                overflow(context);
                return;
            }
            pending.set(command.requestId, {
                requestId: command.requestId,
                databaseName: command.databaseName,
                commandName: command.commandName,
                traceId: context.traceId,
                spanId: context.spanId,
            });
        },
        finished(command: Command & Readonly<{ duration: number }>, outcome: "succeeded" | "failed") {
            const original = pending.get(command.requestId);
            if (!original) {
                return;
            }
            pending.delete(command.requestId);
            if (
                command.databaseName !== original.databaseName ||
                command.commandName !== original.commandName ||
                !Number.isFinite(command.duration) ||
                command.duration < 0
            ) {
                overflow(original);
                return;
            }
            emit({
                kind: "mongo-transaction",
                traceId: original.traceId,
                spanId: original.spanId,
                database: original.databaseName,
                operation: original.commandName,
                requestId: original.requestId,
                durationMs: command.duration,
                outcome,
            });
        },
    };
}
