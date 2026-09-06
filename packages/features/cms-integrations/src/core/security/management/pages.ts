import { dashboardReferenceFieldPaths, evaluateDashboardVisibility } from "@bernouy/cms-dashboards";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationResolvedPage } from "../../../interfaces/IntegrationImport";
import { IntegrationInputError } from "../../errors";
import type { IntegrationManagementDeps } from "./contracts";
import { record } from "./report";
import { readPath } from "./secrets";

export async function resolveManagementPages(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    input: Record<string, unknown>,
): Promise<Record<string, IntegrationResolvedPage>> {
    const values = record(input.values) ? input.values : input;
    const fields = installation.definitionSnapshot?.management?.settings?.fields ?? [];
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
