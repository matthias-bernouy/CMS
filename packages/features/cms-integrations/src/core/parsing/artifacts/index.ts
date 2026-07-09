import { IntegrationInputError } from "../../errors";
import type { DeclarativeArtifactTemplate } from "../../../interfaces/Integration";
import { isRecord, text } from "../values";
import { parseBlocTemplate } from "./bloc";
import { parseDashboardTemplate } from "./dashboard";
import { parseFunctionTemplate } from "./function";
import {
    parseDashboardRelationProjectionTemplate,
    parseRelationTemplate,
} from "./relation";
import { parseSourceTemplate } from "./source";
import { parseSourceOverlayTemplate } from "./sourceOverlay";
import { parseTriggerTemplate } from "./trigger";

export function parseArtifactTemplates(value: unknown): DeclarativeArtifactTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.artifacts", "must be an array");
    return value.map((entry, index) => parseArtifactTemplate(entry, `definition.artifacts.${index}`));
}

function parseArtifactTemplate(value: unknown, name: string): DeclarativeArtifactTemplate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const type = text(value.type);
    if (type === "source") {
        if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
        return { type: "source", source: parseSourceTemplate(value.source, `${name}.source`) };
    }
    if (type === "dashboard") {
        if (!isRecord(value.dashboard)) throw new IntegrationInputError(`${name}.dashboard`, "must be an object");
        return { type: "dashboard", dashboard: parseDashboardTemplate(value.dashboard, `${name}.dashboard`) };
    }
    if (type === "sourceOverlay") {
        if (!isRecord(value.overlay)) throw new IntegrationInputError(`${name}.overlay`, "must be an object");
        return { type: "sourceOverlay", overlay: parseSourceOverlayTemplate(value.overlay, `${name}.overlay`) };
    }
    if (type === "relation") {
        if (!isRecord(value.relation)) throw new IntegrationInputError(`${name}.relation`, "must be an object");
        return { type: "relation", relation: parseRelationTemplate(value.relation, `${name}.relation`) };
    }
    if (type === "dashboardRelation") {
        if (!isRecord(value.projection)) throw new IntegrationInputError(`${name}.projection`, "must be an object");
        return { type: "dashboardRelation", projection: parseDashboardRelationProjectionTemplate(value.projection, `${name}.projection`) };
    }
    if (type === "function") {
        if (!isRecord(value.function)) throw new IntegrationInputError(`${name}.function`, "must be an object");
        return { type: "function", function: parseFunctionTemplate(value.function, `${name}.function`) };
    }
    if (type === "trigger") {
        if (!isRecord(value.trigger)) throw new IntegrationInputError(`${name}.trigger`, "must be an object");
        return { type: "trigger", trigger: parseTriggerTemplate(value.trigger, `${name}.trigger`) };
    }
    if (type === "bloc") {
        if (!isRecord(value.bloc)) throw new IntegrationInputError(`${name}.bloc`, "must be an object");
        return { type: "bloc", bloc: parseBlocTemplate(value.bloc, `${name}.bloc`) };
    }
    throw new IntegrationInputError(`${name}.type`, "must be source, function, trigger, dashboard, sourceOverlay, relation, dashboardRelation, or bloc");
}
