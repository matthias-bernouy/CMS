insert into commerce.notification_rules (
    key, event_type, audience, label, description, policy, template_key, stale_policy
) values
    ('commerce.admin.offer.submitted', 'commerce.admin.offer.submitted', 'admin', 'Product offer submitted', 'A seller submitted a product offer for review.', 'required', 'commerce.admin.offer.submitted', 'always_send'),
    ('commerce.admin.offer.price_submitted', 'commerce.admin.offer.price_submitted', 'admin', 'Product offer price submitted', 'A seller submitted a price for a product offer.', 'required', 'commerce.admin.offer.price_submitted', 'always_send'),
    ('commerce.seller.offer.price_requested', 'commerce.seller.offer.price_requested', 'seller', 'Price requested', 'An administrator requested a price for your product offer.', 'required', 'commerce.seller.offer.price_requested', 'always_send'),
    ('commerce.seller.offer.changes_requested', 'commerce.seller.offer.changes_requested', 'seller', 'Changes requested', 'An administrator requested changes to your product offer.', 'required', 'commerce.seller.offer.changes_requested', 'always_send'),
    ('commerce.seller.offer.approved', 'commerce.seller.offer.approved', 'seller', 'Product offer approved', 'Your product offer and its price have been approved.', 'required', 'commerce.seller.offer.approved', 'always_send'),
    ('commerce.seller.offer.rejected', 'commerce.seller.offer.rejected', 'seller', 'Product offer rejected', 'Your product offer was rejected. Open your account to review the decision.', 'required', 'commerce.seller.offer.rejected', 'always_send'),
    ('commerce.seller.proposal.received', 'commerce.seller.proposal.received', 'seller', 'New price proposal', 'A buyer made a price proposal for your product offer.', 'required', 'commerce.seller.proposal.received', 'always_send'),
    ('commerce.buyer.proposal.rejected', 'commerce.buyer.proposal.rejected', 'buyer', 'Price proposal rejected', 'The seller rejected your price proposal.', 'required', 'commerce.buyer.proposal.rejected', 'always_send'),
    ('commerce.seller.proposal.withdrawn', 'commerce.seller.proposal.withdrawn', 'seller', 'Price proposal withdrawn', 'The buyer withdrew their price proposal.', 'required', 'commerce.seller.proposal.withdrawn', 'always_send'),
    ('commerce.buyer.proposal.expired', 'commerce.buyer.proposal.expired', 'buyer', 'Price proposal expired', 'Your price proposal or its payment window has expired.', 'required', 'commerce.buyer.proposal.expired', 'always_send'),
    ('commerce.seller.proposal.expired', 'commerce.seller.proposal.expired', 'seller', 'Price proposal expired', 'A price proposal or its payment window has expired.', 'required', 'commerce.seller.proposal.expired', 'always_send'),
    ('commerce.buyer.proposal.superseded', 'commerce.buyer.proposal.superseded', 'buyer', 'Another proposal accepted', 'The seller accepted another proposal for this product offer.', 'required', 'commerce.buyer.proposal.superseded', 'always_send'),
    ('commerce.buyer.proposal.canceled', 'commerce.buyer.proposal.canceled', 'buyer', 'Price proposal canceled', 'An administrator canceled your price proposal.', 'required', 'commerce.buyer.proposal.canceled', 'always_send'),
    ('commerce.seller.proposal.canceled', 'commerce.seller.proposal.canceled', 'seller', 'Price proposal canceled', 'An administrator canceled a price proposal for your product offer.', 'required', 'commerce.seller.proposal.canceled', 'always_send')
on conflict (key) do update set
    event_type = excluded.event_type,
    audience = excluded.audience,
    label = excluded.label,
    description = excluded.description,
    policy = excluded.policy,
    template_key = excluded.template_key,
    stale_policy = excluded.stale_policy,
    updated_at = now();
