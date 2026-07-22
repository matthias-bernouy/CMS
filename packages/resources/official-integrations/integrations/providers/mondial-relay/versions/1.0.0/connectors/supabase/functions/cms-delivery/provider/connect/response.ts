import type { ConnectStatus, JsonRecord } from "../../shipment/types.ts";
import { decodeXml, xmlAttributes } from "../xml.ts";

export function connectStatuses(source: string): ConnectStatus[] {
    const xmlStatuses = xmlAttributes(source, "Status")
        .map((attrs) => ({
            code: attrs.Code ?? "",
            level: attrs.Level ?? "",
            message: attrs.Message ?? "",
        }))
        .filter((status) => status.code || status.message);
    if (xmlStatuses.length) {
        return xmlStatuses;
    }
    let value: { statusListField?: Array<{ codeField?: string; levelField?: string; messageField?: string }> };
    try {
        value = JSON.parse(source) as {
            statusListField?: Array<{ codeField?: string; levelField?: string; messageField?: string }>;
        };
    } catch {
        return [];
    }
    return (value.statusListField ?? []).map((status) => ({
        code: status.codeField ?? "",
        level: status.levelField ?? "",
        message: status.messageField ?? "",
    }));
}

export function relayPointInfo(source: string): JsonRecord {
    const values: JsonRecord = {};
    for (const attrs of xmlAttributes(source, "LabelValues")) {
        const key = attrs.Key;
        if (!key) {
            continue;
        }
        values[key] = decodeXml(attrs.Value ?? "");
    }
    return values;
}

export function connectStatusMessage(code: string): string {
    return CONNECT_STATUS_MESSAGES[code] ?? "unmapped Mondial Relay Connect error";
}

const CONNECT_STATUS_MESSAGES: Record<string, string> = {
    "0": "success",
    "10000": "missing login or password",
    "10001": "invalid login or password",
    "10002": "missing customer id",
    "10003": "missing culture",
    "10004": "missing API version",
    "10007": "invalid API version",
    "10009": "missing output type",
    "10011": "empty shipment list",
    "10012": "missing sender information",
    "10014": "unknown reference ignored",
    "10061": "invalid XML format",
};
