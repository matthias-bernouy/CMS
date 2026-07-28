export function unwrapTransaction(sql: string): string {
    const trimmed = sql.trim();
    if (/^BEGIN;[\s\S]*COMMIT;$/i.test(trimmed)) {
        return trimmed.replace(/^BEGIN;\s*/i, "").replace(/\s*COMMIT;$/i, "");
    }
    if (/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(trimmed)) {
        throw new Error("Nested transaction control is forbidden in migration-aware Supabase SQL");
    }
    return trimmed;
}

export function indent(value: string, spaces: number): string {
    const prefix = " ".repeat(spaces);
    return value
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
}

export function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
