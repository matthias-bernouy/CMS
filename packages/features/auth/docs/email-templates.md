# Account email templates

The official Access implementation requires the selected Email Templates renderer
and Emailer. Provisioning installs two ordinary published templates in English,
then stores exact references for verification and password reset. There is no
implicit fallback if configuration or a publication is missing.

Read `get-email-configuration`, then use its revision with
`update-email-configuration`. Each association includes a server-issued source
identity from the selected Templates service, a template UUID and exact version.
Switching Providers requires explicitly revalidating/rebinding both associations.
Publishing another version never changes them. Existing archived publications
remain usable; an archived template cannot receive a new association.

Supported variables are siteName, recipientEmail, recipientName (text), actionUrl
(url) and expiresAt (date-time). Required actionUrl must appear in the plain-text
body and, when HTML is provided, as the complete href of an action link.
Access constructs the URL and expiry; templates never choose tokens or recipients.
Preview with fictitious URLs and identities; never send real reset links to MCP.
