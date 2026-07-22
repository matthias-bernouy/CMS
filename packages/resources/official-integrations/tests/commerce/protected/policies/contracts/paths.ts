import { resolve } from "node:path";

export const integrationRoot = resolve(import.meta.dir, "../../../../../integrations/domains/commerce/versions/1.0.0");

export function functionSql(schema: string, start: string, end: string): string {
    return schema.slice(
        schema.indexOf(`create or replace function commerce.${start}(`),
        schema.indexOf(`create or replace function commerce.${end}(`),
    );
}
