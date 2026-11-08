/**
 * Constant-time-ish login: when an email is unknown, a `LocalCredentialStore`
 * must still spend a password-verify's worth of time, otherwise the fast "no
 * such account" path leaks which emails are registered (timing enumeration).
 *
 * Call `dummyPasswordVerify(password)` on the miss path: it runs argon2 against
 * a fixed throwaway hash (same default params as real hashes → comparable
 * cost). The result is discarded; only the time spent matters.
 */
let _dummyHash: Promise<string> | null = null;

export async function dummyPasswordVerify(password: string): Promise<void> {
    _dummyHash ??= Bun.password.hash("constant-time-decoy-password");
    await Bun.password.verify(password, await _dummyHash);
}
