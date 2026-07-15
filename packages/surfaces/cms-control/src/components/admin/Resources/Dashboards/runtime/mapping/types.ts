import type { DashboardOption } from "@bernouy/cms-dashboards";
import type { WDetailSchemaDefinition } from "../../widgets/w-detail/types";

export type DetailOptions = Record<string, DashboardOption[]>;
export type DetailSchema = {
    definitions: WDetailSchemaDefinition[];
    status: "loading" | "ready" | "error";
};
export type DetailSchemas = Record<string, DetailSchema>;
