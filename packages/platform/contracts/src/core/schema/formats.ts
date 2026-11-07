import type { UlviaStringFormat } from "../../interfaces/UlviaSchema";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$(?![\s\S])/;
const DATE_TIME_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$(?![\s\S])/;

/** Checks only lengths permitted by this dialect's format validators, not general satisfiability. */
export function hasStringFormatLength(format: UlviaStringFormat, minimum: number, maximum: number): boolean {
    switch (format) {
        case "date":
            return minimum <= 10 && maximum >= 10;
        case "date-time":
            // UTC seconds use 20 characters; fractional seconds start at 22, not 21.
            return maximum >= 20 && (minimum <= 20 || maximum >= Math.max(minimum, 22));
        case "email":
            return maximum >= 5;
        case "uri":
            return maximum >= 2;
        case "uuid":
            return minimum <= 36 && maximum >= 36;
    }
}

export function matchesStringFormat(value: string, format: UlviaStringFormat): boolean {
    switch (format) {
        case "date":
            return isValidDate(value);
        case "date-time":
            return isValidDateTime(value);
        case "email":
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$(?![\s\S])/.test(value);
        case "uri":
            return URL.canParse(value);
        case "uuid":
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$(?![\s\S])/i.test(value);
    }
}

function isValidDate(value: string): boolean {
    const match = value.match(DATE_PATTERN);
    return match ? isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) : false;
}

function isValidDateTime(value: string): boolean {
    const match = value.match(DATE_TIME_PATTERN);
    if (!match || !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
        return false;
    }
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
    const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
    return hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) {
        return false;
    }
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1]!;
}
