import { ProviderManifestValidationError } from "../errors";
import { expectString } from "../values";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export function parseIdentifier(value: unknown, path: string, maximum = 128): string {
    const identifier = expectString(value, path, maximum);
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a lowercase dotted identifier", path);
    }
    return identifier;
}

export function parseDateTime(value: unknown, path: string): string {
    const dateTime = expectString(value, path, 64);
    const match = dateTime.match(DATE_TIME_PATTERN);
    if (!match || !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a valid date-time", path);
    }
    const validClock =
        Number(match[4]) <= 23 &&
        Number(match[5]) <= 59 &&
        Number(match[6]) <= 59 &&
        (match[8] === undefined || Number(match[8]) <= 23) &&
        (match[9] === undefined || Number(match[9]) <= 59);
    if (!validClock) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a valid date-time", path);
    }
    return dateTime;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) {
        return false;
    }
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1]!;
}
