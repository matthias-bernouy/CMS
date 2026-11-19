import { transactionWitness, isTransactionControl } from "../instrumentation/transactions";
import type { ProbeRow } from "./probe";
import type { ProfileMetrics } from "./profiler";

export function mongoEvidence(
    command: ProbeRow,
    profile: readonly ProfileMetrics[],
    rows: readonly ProbeRow[],
): boolean {
    if (isTransactionControl(command.database, command.operation)) {
        return Boolean(transactionWitness(command, rows));
    }
    return (
        typeof command.database === "string" &&
        command.database.length > 0 &&
        profile.some(
            (row) => row.database === command.database && row.traceId === command.traceId && row.operations > 0,
        )
    );
}

export function mongoTransactionWitnesses(commands: readonly ProbeRow[], rows: readonly ProbeRow[]) {
    return commands.flatMap((command) => {
        const witness = transactionWitness(command, rows);
        return witness ? [witness] : [];
    });
}
