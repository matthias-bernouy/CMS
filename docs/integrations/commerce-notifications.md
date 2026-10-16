# Commerce marketplace notifications

Commerce `2.1.0` adds administrator notifications for submitted product offers and
seller-submitted prices, plus seller notifications for requested prices,
requested changes, approval, and rejection. Negotiation `1.2.0` captures proposal
creation, rejection, withdrawal, expiry, supersession, and administrator
cancellation. The existing accepted-price-agreement notification remains the
single buyer acceptance email.

Negotiation `1.2.0` retains its supported Commerce `>=1.0.0 <3.0.0` range. Its new
producer checks for Commerce's private notification capability before emitting
events. Older Commerce installations retain their existing behavior; the new
proposal emails activate when Commerce `2.1.0` installs that capability.

For an existing Commerce 1.x site, upgrade Negotiation to `1.2.0` before upgrading
Commerce to `2.1.0`. This widens the older Negotiation dependency range before the
Commerce major transition. Commerce deploys `cms-commerce-v2-1` alongside the
existing function slugs and switches its CMS Source bindings to the new slug.

Install Emailer for builtin email delivery. Configure
`adminRecipientCmsUserIds` in Commerce's notification configuration to receive
administrator messages. Recipients are CMS subjects, including their provider
prefix; the dispatching CMS resolves their email from its own users repository.
Instances consuming the same Commerce queue must share the relevant CMS user
store, or only the correct instance should run notification dispatch.

The upgrade preserves administrator-disabled rules and does not replay historical
events or reset dead-letter deliveries. Offer and proposal delivery snapshots
have no order. Template preview data retains the published order field for
backward compatibility, and the new templates use offer/proposal tokens instead.
