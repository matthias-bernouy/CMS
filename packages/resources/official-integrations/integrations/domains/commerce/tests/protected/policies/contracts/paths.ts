import { resolve } from "node:path";
import { loadSupabaseSchemaSql } from "../../../../../../../tests/helpers/supabaseSql";

export const integrationRoot = resolve(import.meta.dir, "../../../..");

export async function loadCommerceSchemaSql(): Promise<string> {
    return await loadSupabaseSchemaSql(integrationRoot);
}

export function functionSql(schema: string, start: string, end: string): string {
    return schema.slice(
        schema.indexOf(`create or replace function commerce.${start}(`),
        schema.indexOf(`create or replace function commerce.${end}(`),
    );
}
