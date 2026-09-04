import { parseDate, PublicError } from "./profile.ts";

const STRIPE_V2_API = "https://api.stripe.com/v2";
const STRIPE_V2_VERSION = "2026-06-24.dahlia";

export async function createAccountToken(publishableKey, profile) {
    const response = await fetch(`${STRIPE_V2_API}/core/account_tokens`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${publishableKey}`,
            "content-type": "application/json",
            "stripe-version": STRIPE_V2_VERSION,
        },
        body: JSON.stringify({
            contact_email: profile.email,
            display_name: `${profile.givenName} ${profile.surname}`,
            identity: {
                entity_type: "individual",
                individual: {
                    given_name: profile.givenName,
                    surname: profile.surname,
                    email: profile.email,
                    phone: profile.phone,
                    date_of_birth: parseDate(profile.birthDate),
                    address: {
                        country: "fr",
                        line1: profile.addressLine1,
                        postal_code: profile.postalCode,
                        city: profile.city,
                    },
                },
                attestations: { terms_of_service: { account: { shown_and_accepted: true } } },
            },
        }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.id !== "string") {
        throw new PublicError("Ces informations n’ont pas pu être vérifiées. Vérifie-les puis réessaie.");
    }
    return body.id;
}
