# @bernouy/ulvia-official-provider

This product package owns the official Ulvia provider domain, HTTP boundary,
persistence adapters and executable server entrypoint. It is not a CMS feature
or a CMS runtime.

The provider may depend on generic Foundation packages. It may consume public
provider protocol, schema and binding contracts, but must not import CMS
installation state, Control, Delivery, CMS runtimes or package-private source
paths. CMS packages must not depend on this implementation; the local CLI is
the only composition exception and uses the declared `./server` export.

Keep the HTTP handler independent of CMS Control and Delivery. A provider token
authenticates every request, while the CMS gateway authorizes caller access to
individual capabilities. Store submissions in a provider-owned directory;
never place them in CMS content storage.

The root export stays environment-independent. `./local-fs` exposes the local
storage adapter and `./server` is the executable composition entrypoint. Only
the server entrypoint may read environment configuration or start a listener.

Official contract, provider-manifest and collection publications live in
`packages/official-repository`; do not duplicate authored releases here.

This local slice is not a production provider. It has one development account,
no remote callback registration and no conformance attestation.
