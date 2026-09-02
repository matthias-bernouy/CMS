import {
    DASHBOARD_SCHEMA_VERSION,
    normalizeLegacyDashboardView,
    type DashboardDefinition,
    type DashboardDto,
    type DashboardViewDefinition,
    type DashboardViewMount,
    type DashboardViewNode,
} from "@bernouy/cms-dashboards";
import type { DeclarativeDashboardArtifactTemplate } from "../../../../interfaces/Integration";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { parseArtifactIcon } from "../../definition/icon";
import { isRecord, preservedText, text } from "../../definition/values";
import { parseWidget } from "./widgets";

export function parseDashboardViewTemplate(value: Record<string, unknown>, name: string): DashboardViewDefinition {
    if (value.schemaVersion !== DASHBOARD_SCHEMA_VERSION) {
        return normalizeLegacyDashboardView(parseLegacyDashboardTemplate(value, name));
    }
    const id = text(value.id);
    if (!id) {
        throw new MissingIntegrationParam(`${name}.id`);
    }
    const source = text(value.source);
    if (!source) {
        throw new MissingIntegrationParam(`${name}.source`);
    }
    if (!isRecord(value.view)) {
        throw new IntegrationInputError(`${name}.view`, "must be an object");
    }
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id,
        source,
        meta: isRecord(value.meta) ? parseDashboardMeta(value.meta, `${name}.meta`) : { name: id },
        view: parseViewNode(value.view, `${name}.view`),
        ...(isRecord(value.availability)
            ? { availability: parseAvailability(value.availability, `${name}.availability`) }
            : {}),
        ...(text(value.requires) ? { requires: text(value.requires)! } : {}),
        ...(text(value.revision) ? { revision: text(value.revision)! } : {}),
    };
}

export function parseDashboardTemplate(
    value: Record<string, unknown>,
    name: string,
): DeclarativeDashboardArtifactTemplate["dashboard"] {
    const id = requiredText(value.id, `${name}.id`);
    if (!Array.isArray(value.views)) {
        throw new IntegrationInputError(`${name}.views`, "must be an array");
    }
    const status = text(value.status) ?? "published";
    if (status !== "draft" && status !== "published") {
        throw new IntegrationInputError(`${name}.status`, "must be draft or published");
    }
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id,
        meta: isRecord(value.meta) ? parseDashboardMeta(value.meta, `${name}.meta`) : { name: id },
        homeView: requiredText(value.homeView, `${name}.homeView`),
        views: value.views.map((mount, index) => parseViewMount(mount, `${name}.views.${index}`)),
        status,
        ...(text(value.revision) ? { revision: text(value.revision)! } : {}),
    };
}

function parseLegacyDashboardTemplate(value: Record<string, unknown>, name: string): DashboardDto {
    const id = requiredText(value.id, `${name}.id`);
    const source = requiredText(value.source, `${name}.source`);
    if (!Array.isArray(value.views)) {
        throw new IntegrationInputError(`${name}.views`, "must be an array");
    }
    return {
        id,
        source,
        ...(isRecord(value.meta) ? { meta: parseDashboardMeta(value.meta, `${name}.meta`) } : {}),
        views: value.views.map((widget, index) => parseWidget(widget, `${name}.views.${index}`)),
        ...(text(value.requires) ? { requires: text(value.requires)! } : {}),
    };
}

function parseViewNode(value: Record<string, unknown>, name: string): DashboardViewNode {
    if (!Array.isArray(value.widgets)) {
        throw new IntegrationInputError(`${name}.widgets`, "must be an array");
    }
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        widgets: value.widgets.map((widget, index) => parseWidget(widget, `${name}.widgets.${index}`)),
        ...(Array.isArray(value.children)
            ? {
                  children: value.children.map((child, index) => {
                      if (!isRecord(child)) {
                          throw new IntegrationInputError(`${name}.children.${index}`, "must be an object");
                      }
                      return parseViewNode(child, `${name}.children.${index}`);
                  }),
              }
            : {}),
    };
}

function parseViewMount(value: unknown, name: string): DashboardViewMount {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        id: requiredText(value.id, `${name}.id`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(text(value.use) ? { use: text(value.use)! } : {}),
        ...(text(value.revision) ? { revision: text(value.revision)! } : {}),
        ...(Array.isArray(value.children)
            ? { children: value.children.map((child, index) => parseViewMount(child, `${name}.children.${index}`)) }
            : {}),
    };
}

function parseAvailability(value: Record<string, unknown>, name: string): DashboardViewDefinition["availability"] {
    const placement = value.defaultPlacement;
    if (placement !== undefined && !isRecord(placement)) {
        throw new IntegrationInputError(`${name}.defaultPlacement`, "must be an object");
    }
    const order = isRecord(placement) && typeof placement.order === "number" ? placement.order : undefined;
    return {
        ...(typeof value.catalog === "boolean" ? { catalog: value.catalog } : {}),
        ...(isRecord(placement)
            ? {
                  defaultPlacement: {
                      dashboardId: requiredText(placement.dashboardId, `${name}.defaultPlacement.dashboardId`),
                      ...(order !== undefined ? { order } : {}),
                  },
              }
            : {}),
    };
}

function parseDashboardMeta(value: Record<string, unknown>, name: string): DashboardDefinition["meta"] {
    const metaName = text(value.name);
    if (!metaName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    const icon = parseArtifactIcon(value.icon, `${name}.icon`);
    return {
        name: metaName,
        ...(icon ? { icon } : {}),
        ...(preservedText(value.svg) ? { svg: preservedText(value.svg)! } : {}),
    };
}

function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    return parsed;
}
