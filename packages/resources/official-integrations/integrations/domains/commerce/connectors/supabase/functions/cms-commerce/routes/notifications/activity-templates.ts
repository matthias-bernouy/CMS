const seeds = [
    ["commerce.admin.offer.submitted", "Product offer submitted", "A seller submitted a product offer for review."],
    [
        "commerce.admin.offer.price_submitted",
        "Product offer price submitted",
        "A seller submitted a price for a product offer.",
    ],
    [
        "commerce.seller.offer.price_requested",
        "Price requested",
        "An administrator requested a price for your product offer.",
    ],
    [
        "commerce.seller.offer.changes_requested",
        "Changes requested",
        "An administrator requested changes to your product offer.",
    ],
    [
        "commerce.seller.offer.approved",
        "Product offer approved",
        "Your product offer and its price have been approved.",
    ],
    [
        "commerce.seller.offer.rejected",
        "Product offer rejected",
        "Your product offer was rejected. Open your account to review the decision.",
    ],
    [
        "commerce.seller.proposal.received",
        "New price proposal",
        "A buyer made a price proposal for your product offer.",
    ],
    ["commerce.buyer.proposal.rejected", "Price proposal rejected", "The seller rejected your price proposal."],
    ["commerce.seller.proposal.withdrawn", "Price proposal withdrawn", "The buyer withdrew their price proposal."],
    [
        "commerce.buyer.proposal.expired",
        "Price proposal expired",
        "Your price proposal or its payment window has expired.",
    ],
    [
        "commerce.seller.proposal.expired",
        "Price proposal expired",
        "A price proposal or its payment window has expired.",
    ],
    [
        "commerce.buyer.proposal.superseded",
        "Another proposal accepted",
        "The seller accepted another proposal for this product offer.",
    ],
    ["commerce.buyer.proposal.canceled", "Price proposal canceled", "An administrator canceled your price proposal."],
    [
        "commerce.seller.proposal.canceled",
        "Price proposal canceled",
        "An administrator canceled a price proposal for your product offer.",
    ],
] as const;

export function marketplaceNotificationTemplates() {
    return seeds.map(([key, label, message]) => {
        const proposal = key.includes(".proposal.");
        const amountHtml = proposal ? "<p>Proposed price: <strong>{{ proposal.amountFormatted }}</strong></p>" : "";
        const amountText = proposal ? "\nProposed price: {{ proposal.amountFormatted }}" : "";
        return {
            key,
            name: `Commerce - ${label}`,
            status: "active",
            subject: `${label}: {{ offer.title }}`,
            htmlBody: `<p>${message}</p><p><strong>{{ offer.title }}</strong></p>${amountHtml}<p><a href="{{ action.path }}">View details</a></p>`,
            textBody: `${message}\n\n{{ offer.title }}${amountText}\nView details: {{ action.path }}`,
            requiredTokens: [
                { name: "offer.title", description: "Product offer title", sample: "Sample product" },
                {
                    name: "action.path",
                    description: "Recipient account or administrator path",
                    sample: "/account/offers?offerId=91",
                },
                ...(proposal
                    ? [
                          {
                              name: "proposal.amountFormatted",
                              description: "Human-readable proposed price",
                              sample: "120.00 EUR",
                          },
                      ]
                    : []),
            ],
            sampleData: {
                recipient: { email: "recipient@example.com" },
                offer: { id: 91, slug: "sample-product", title: "Sample product" },
                delivery: { status: "updated", label },
                action: {
                    path: key.startsWith("commerce.admin.")
                        ? "/.cms/admin"
                        : proposal
                          ? "/account/negotiations"
                          : "/account/offers?offerId=91",
                },
                ...(proposal
                    ? {
                          proposal: {
                              id: "00000000-0000-0000-0000-000000000003",
                              status: "pending",
                              previousStatus: null,
                              amountMinor: 12000,
                              amountFormatted: "120.00 EUR",
                              currency: "EUR",
                          },
                      }
                    : {}),
            },
            metadata: { owner: "commerce", contractVersion: 1 },
        };
    });
}
