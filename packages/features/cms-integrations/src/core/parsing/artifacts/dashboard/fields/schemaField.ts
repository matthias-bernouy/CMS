import {
    isSafeDashboardExpression,
    isSafeDashboardPath,
    type DashboardField,
    type DashboardFieldBase,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../../errors";
import { isRecord } from "../../../definition/values";
import { requiredText } from "../../common";
import { parseDataRef } from "../refs";

export function parseSchemaField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "schema" }> {
    for (const key of ["reloadOn", "excludeKeysFrom"]) {
        if (Object.hasOwn(value, key)) {
            throw new IntegrationInputError(`${name}.${key}`, "is not supported");
        }
    }
    if (!isRecord(value.schema)) {
        throw new IntegrationInputError(`${name}.schema`, "must be an object");
    }
    return {
        ...base,
        type: "schema",
        schema: parseDataRef(value.schema, `${name}.schema`),
        ...(value.exclude !== undefined ? { exclude: parseSchemaExclusion(value.exclude, `${name}.exclude`) } : {}),
    };
}

function parseSchemaExclusion(value: unknown, name: string): Extract<DashboardField, { type: "schema" }>["exclude"] {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (Object.keys(value).some((key) => key !== "from" && key !== "valuePath")) {
        throw new IntegrationInputError(name, "may only contain from and valuePath");
    }
    const from = requiredText(Object.hasOwn(value, "from") ? value.from : undefined, `${name}.from`);
    const valuePath = requiredText(
        Object.hasOwn(value, "valuePath") ? value.valuePath : undefined,
        `${name}.valuePath`,
    );
    if (!isSafeDashboardExpression(from, ["field"], true)) {
        throw new IntegrationInputError(`${name}.from`, "must be a $field expression with a safe dotted data path");
    }
    if (!isSafeDashboardPath(valuePath)) {
        throw new IntegrationInputError(`${name}.valuePath`, "must be a safe dotted data path");
    }
    return { from: from as `$field.${string}`, valuePath };
}
