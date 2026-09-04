import type { FinancialOperationRow } from "../../db/records/operations.ts";

export function requiredOperationString(operation: FinancialOperationRow, name: string): string {
    const value = operation.request[name];
    if (typeof value !== "string" || !value) {
        throw new Error(`operation ${operation.id} has invalid ${name}`);
    }
    return value;
}

export function optionalOperationString(operation: FinancialOperationRow, name: string): string | null {
    const value = operation.request[name];
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        throw new Error(`operation ${operation.id} has invalid ${name}`);
    }
    return value;
}

export function requiredOperationInteger(operation: FinancialOperationRow, name: string): number {
    const value = operation.request[name];
    if (!Number.isSafeInteger(value)) {
        throw new Error(`operation ${operation.id} has invalid ${name}`);
    }
    return Number(value);
}

export function optionalOperationInteger(operation: FinancialOperationRow, name: string): number | null {
    const value = operation.request[name];
    if (value === null || value === undefined) {
        return null;
    }
    if (!Number.isSafeInteger(value)) {
        throw new Error(`operation ${operation.id} has invalid ${name}`);
    }
    return Number(value);
}
