/** Protocol metadata belongs to trusted transport headers, never authored binding input. */
export const DELEGATION_HEADER = "x-ulvia-delegation";
export const PROVIDER_AUTHORITY_HEADER = "x-ulvia-provider-authority";
export type ProviderWireAuthority = "provider" | "delegated";

export function validDelegationTicket(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}
