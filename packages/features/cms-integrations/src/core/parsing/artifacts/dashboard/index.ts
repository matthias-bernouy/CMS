import type { DashboardDto } from "@bernouy/cms-dashboards";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseWidget } from "./widgets";

export function parseDashboardTemplate(value: Record<string, unknown>, name: string): DashboardDto {
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    const source = text(value.source);
    if (!source) throw new MissingIntegrationParam(`${name}.source`);
    if (!Array.isArray(value.views)) throw new IntegrationInputError(`${name}.views`, "must be an array");
    return {
        id,
        ...(isRecord(value.meta) ? { meta: parseDashboardMeta(value.meta, `${name}.meta`) } : {}),
        source,
        views: value.views.map((widget, index) => parseWidget(widget, `${name}.views.${index}`)),
        ...(text(value.requires) ? { requires: text(value.requires)! } : {}),
    };
}

function parseDashboardMeta(value: Record<string, unknown>, name: string): DashboardDto["meta"] {
    const metaName = text(value.name);
    if (!metaName) throw new MissingIntegrationParam(`${name}.name`);
    return {
        name: metaName,
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(text(value.svg) ? { svg: text(value.svg)! } : {}),
    };
}
