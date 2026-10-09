import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionComponentSettings } from "../../../interfaces/CollectionBloc";
import { settingControlValues } from "./settingControls";

export function settingsSchema(settings: CollectionComponentSettings): UlviaObjectSchema {
    return {
        type: "object",
        properties: Object.fromEntries(
            settings.map((item) => [
                item.id,
                item.type === "boolean"
                    ? { type: "boolean" as const }
                    : item.type === "string"
                      ? {
                            type: "string" as const,
                            maxLength:
                                item.maxLength ??
                                settingControlValues(item.control)?.reduce(
                                    (maximum, value) => Math.max(maximum, value.length),
                                    0,
                                ) ??
                                256,
                            ...(item.minLength === undefined ? {} : { minLength: item.minLength }),
                            ...(settingControlValues(item.control) === undefined
                                ? {}
                                : { enum: settingControlValues(item.control) }),
                        }
                      : {
                            type: item.type,
                            ...(item.minimum === undefined ? {} : { minimum: item.minimum }),
                            ...(item.maximum === undefined ? {} : { maximum: item.maximum }),
                        },
            ]),
        ),
        required: settings.map((item) => item.id),
    };
}
