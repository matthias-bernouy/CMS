import type { JsonRecord } from "../../shipment/types.ts";

export function providerOccurredAt(event: JsonRecord): string | null {
    const date = String(event.event_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
    }
    const timeMatch = String(event.event_time ?? "00:00")
        .replace(/h/i, ":")
        .match(/^(\d{2}):(\d{2})/);
    const [year, month, day] = date.split("-").map(Number);
    const hour = Number(timeMatch?.[1] ?? 0);
    const minute = Number(timeMatch?.[2] ?? 0);
    if (![year, month, day, hour, minute].every(Number.isFinite)) {
        return null;
    }
    const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
    const offset = parisOffsetMinutes(new Date(wallClockUtc));
    return new Date(wallClockUtc - offset * 60_000).toISOString();
}

export function trackingEventKey(expeditionNumber: string, event: JsonRecord): string {
    return [
        "mondial-relay",
        expeditionNumber,
        event.event_date,
        event.event_time,
        event.event_label,
        event.location,
        event.relay_country,
        event.relay_number,
    ]
        .map((value) => String(value ?? "").trim())
        .join("|");
}

function parisOffsetMinutes(date: Date): number {
    const zone =
        new Intl.DateTimeFormat("en", {
            timeZone: "Europe/Paris",
            timeZoneName: "shortOffset",
            year: "numeric",
        })
            .formatToParts(date)
            .find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
    const match = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) {
        return 60;
    }
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
}
