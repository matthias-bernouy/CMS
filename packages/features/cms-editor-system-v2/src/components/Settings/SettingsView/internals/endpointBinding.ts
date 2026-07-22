import {
    CMS_BINDING_ATTRIBUTES,
    asSource,
    asSourceBody,
    parseSource,
    parseSourceBody,
    type CmsSourceBinding,
    type EndpointPickerMethod,
    type EndpointPickerSetting,
} from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../../runtime";
import type {
    DataSourcePickerSelectDetail,
    DataSourcePickerSourceBinding,
} from "../../../Layout/Pickers/DataSourcePicker/DataSourcePicker";
import type { SettingsViewAttributeChanges } from "../SettingsView";

export function endpointOptions(setting: EndpointPickerSetting, dataSources: EditorDataSource[]): EditorDataSource[] {
    const methods = new Set(setting.methods ?? []);
    return dataSources.filter((source) => methods.size === 0 || methods.has(endpointMethod(source)));
}

export function selectedEndpoint(
    setting: EndpointPickerSetting,
    dataSources: EditorDataSource[],
): EditorDataSource | null {
    if (!setting.defaultValue) {
        return null;
    }
    const binding = initialEndpointBinding(setting);
    return (
        endpointOptions(setting, dataSources).find((source) => {
            if (usesSourceBinding(setting) && binding) {
                return (
                    binding.url === source.url ||
                    binding.url.startsWith(`${source.url}?`) ||
                    (source.url.includes("?") && binding.url.startsWith(`${source.url}&`))
                );
            }
            return source.url === setting.defaultValue;
        }) ?? null
    );
}

export function initialEndpointBinding(setting: EndpointPickerSetting): DataSourcePickerSourceBinding | null {
    if (!setting.defaultValue) {
        return null;
    }
    if (!usesSourceBinding(setting)) {
        return { url: setting.defaultValue };
    }

    const source = parseSource(setting.defaultValue);
    const body = parseSourceBody(setting.defaultBody);
    return source
        ? {
              url: source.url,
              ...(source.alias ? { alias: source.alias } : {}),
              ...(setting.defaultMethod ? { method: setting.defaultMethod } : {}),
              ...(body ? { body: body as DataSourcePickerSourceBinding["body"] } : {}),
          }
        : null;
}

export function endpointValue(setting: EndpointPickerSetting, detail: DataSourcePickerSelectDetail): string {
    return usesSourceBinding(setting) ? asSource(detail.binding as CmsSourceBinding) : detail.source.url;
}

export function endpointAttributes(
    setting: EndpointPickerSetting,
    detail: DataSourcePickerSelectDetail,
    value: string,
): SettingsViewAttributeChanges {
    const attributes: SettingsViewAttributeChanges = { [setting.attribute]: value };
    if (setting.methodAttribute) {
        attributes[setting.methodAttribute] = detail.binding.method ?? endpointMethod(detail.source);
    }
    if (usesSourceBinding(setting)) {
        const body = detail.binding.body
            ? (asSourceBody as (body: NonNullable<DataSourcePickerSourceBinding["body"]>) => string)(
                  detail.binding.body,
              )
            : "";
        attributes[CMS_BINDING_ATTRIBUTES.sourceBody] = body || null;
        attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger] =
            detail.binding.trigger === "submit" || detail.binding.trigger === "change" ? detail.binding.trigger : null;
    }
    return attributes;
}

export function removedEndpointAttributes(setting: EndpointPickerSetting): SettingsViewAttributeChanges {
    const attributes: SettingsViewAttributeChanges = { [setting.attribute]: null };
    if (setting.methodAttribute) {
        attributes[setting.methodAttribute] = null;
    }
    if (usesSourceBinding(setting)) {
        attributes[CMS_BINDING_ATTRIBUTES.sourceBody] = null;
        attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger] = null;
    }
    return attributes;
}

function endpointMethod(source: EditorDataSource): EndpointPickerMethod {
    return source.method ?? "GET";
}

function usesSourceBinding(setting: EndpointPickerSetting): boolean {
    return setting.attribute === CMS_BINDING_ATTRIBUTES.source;
}
