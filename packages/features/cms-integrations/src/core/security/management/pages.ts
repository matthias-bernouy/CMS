import { dashboardReferenceFieldPaths, evaluateDashboardVisibility } from "@bernouy/cms-dashboards";
import type { IntegrationResolvedPage } from "../../../interfaces/IntegrationImport";
import { IntegrationInputError } from "../../errors";
import type { IntegrationRuntimeDeps } from "./contracts";
import { readPath } from "./secrets";

export async function resolveManagementPages(
    deps: Pick<IntegrationRuntimeDeps, "resolvePublishedPage">,
    fields: import("@bernouy/cms-dashboards").DashboardField[],
    values: Record<string, unknown>,
): Promise<Record<string, IntegrationResolvedPage>> {
    const visibleFields = fields.filter((field) =>
        evaluateDashboardVisibility(field.visibleWhen, (expression) => {
            if (expression.startsWith("$resource.")) {
                return readPath(values, expression.slice(10));
            }
            if (expression.startsWith("$field.")) {
                const [id, ...segments] = expression.slice(7).split(".");
                const target = fields.find((candidate) => candidate.id === id);
                return target ? readPath(values, [target.path, ...segments].join(".")) : undefined;
            }
            return undefined;
        }),
    );
    const result: Record<string, IntegrationResolvedPage> = {};
    for (const { path, field } of dashboardReferenceFieldPaths(visibleFields, values, "page-link")) {
        const value = readPath(values, path);
        if (value === undefined || value === null || value === "") {
            continue;
        }
        if (typeof value !== "string") {
            throw new IntegrationInputError(path, "must be a page path");
        }
        if (field.type !== "page-link") {
            continue;
        }
        if ((field.allowExternal && /^https?:\/\//.test(value)) || (field.allowMedia && value.startsWith("media:"))) {
            continue;
        }
        if (!deps.resolvePublishedPage) {
            throw new IntegrationInputError(path, "published page resolution is unavailable");
        }
        const page = await deps.resolvePublishedPage(value);
        if (!page) {
            throw new IntegrationInputError(path, "selected page is missing or unpublished");
        }
        result[path] = page;
    }
    return result;
}
