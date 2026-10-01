# @bernouy/ulvia-official-provider

The first official provider slice serves catalogue reads, form submissions and
one public media asset. Keep the HTTP handler independent of CMS Control and
Delivery. A provider token authenticates every request, while the CMS gateway
authorizes caller access to individual capabilities. Store submissions in a
provider-owned directory; never place them in CMS content storage.

This local slice is not a production provider. It has one development account,
no remote callback registration and no conformance attestation.
