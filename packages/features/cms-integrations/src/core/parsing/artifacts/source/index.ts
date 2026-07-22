import type { SourceDto } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { parseArtifactIcon } from "../../definition/icon";
import { isRecord, text } from "../../definition/values";
import { parseEndpointTemplate } from "./endpoint";

export function parseSourceTemplate(value: Record<string, unknown>, name: string): SourceDto {
    const id = text(value.id);
    if (!id) {
        throw new MissingIntegrationParam(`${name}.id`);
    }
    if (!isRecord(value.meta)) {
        throw new IntegrationInputError(`${name}.meta`, "must be an object");
    }
    const metaName = text(value.meta.name);
    if (!metaName) {
        throw new MissingIntegrationParam(`${name}.meta.name`);
    }
    const metaIcon = parseArtifactIcon(value.meta.icon, `${name}.meta.icon`);
    if (!Array.isArray(value.endpoints)) {
        throw new IntegrationInputError(`${name}.endpoints`, "must be an array");
    }
    return {
        id,
        meta: {
            name: metaName,
            ...(text(value.meta.description) ? { description: text(value.meta.description)! } : {}),
            ...(metaIcon ? { icon: metaIcon } : {}),
            ...(text(value.meta.svg) ? { svg: text(value.meta.svg)! } : {}),
        },
        endpoints: value.endpoints.map((endpoint, index) =>
            parseEndpointTemplate(endpoint, `${name}.endpoints.${index}`),
        ),
    };
}

export { requiredText } from "../common";
