import type { SourceMeta } from "@bernouy/cms-sources";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { slugify } from "cms-control/core/validation/slugify";

export type OfficialProviderKind = "supabase";

export type SupabaseOfficialProviderImportDto = {
    kind: "supabase";
    id: string;
    projectUrl: string;
    apiKey: string;
    schema?: string;
    meta?: Partial<SourceMeta>;
};

export type OfficialProviderImportDto = SupabaseOfficialProviderImportDto;

export function parseOfficialProviderImportDto(body: Record<string, unknown>): OfficialProviderImportDto {
    const kind = text(body.kind);
    if (!kind) throw new MissingParam("kind");
    if (kind !== "supabase") throw new InvalidParam("kind", "must be supabase");

    const idInput = text(body.id);
    if (!idInput) throw new MissingParam("id");
    const id = slugify(idInput);
    if (!id) throw new InvalidParam("id", "cannot derive an id");

    const projectUrl = text(body.projectUrl) ?? text(body["supabase.projectUrl"]);
    if (!projectUrl) throw new MissingParam("projectUrl");

    const apiKey = text(body.apiKey) ?? text(body["supabase.apiKey"]);
    if (!apiKey) throw new MissingParam("apiKey");

    const schema = parseSchema(body);

    return { kind, id, projectUrl, apiKey, ...(schema ? { schema } : {}), ...parseMeta(body) };
}

function parseMeta(body: Record<string, unknown>): { meta?: Partial<SourceMeta> } {
    const nested = typeof body.meta === "object" && body.meta !== null && !Array.isArray(body.meta)
        ? body.meta as Record<string, unknown>
        : {};
    const name = text(body["meta.name"]) ?? text(nested.name);
    const description = text(body["meta.description"]) ?? text(nested.description);
    const icon = text(body["meta.icon"]) ?? text(nested.icon);
    const meta = {
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        ...(icon ? { icon } : {}),
    };
    return Object.keys(meta).length ? { meta } : {};
}

const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

function parseSchema(body: Record<string, unknown>): string | undefined {
    const schema = text(body.schema) ?? text(body["supabase.schema"]);
    if (!schema) return undefined;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
        throw new InvalidParam("schema", "must be a Postgres identifier");
    }
    return schema;
}
