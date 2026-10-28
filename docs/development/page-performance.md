# Page performance and headless hosts

Investigate host scheduling, available memory, kernel messages and container
restarts before attributing a slow Page to MongoDB or adding a cache. Record
TTFB, browser resource timings and Gateway phase timings separately. A healthy
`/readyz` response only establishes Edge readiness; it does not measure Page
rendering or Provider dependencies.

The local instance Docker journey exercises `/admin/pages` twice with an active
browser session. It checks that the document stays private/no-store and that
versioned public Bloc JS/CSS retain immutable caching and conditional 304
responses. Timings are printed as diagnostic evidence, without brittle
machine-specific latency assertions. Unit tests gate artifact read counts,
cache bounds, preparation concurrency and live revocation fences.

## Cirrus framebuffer stalls on a headless VPS

On an affected host, Linux kernel traces may report repeated `cirrus-qemu`
framebuffer work, vblank timeouts and soft lockups while application containers
have no OOM or restart. Confirm these traces and that SSH plus an active serial
console are available. This is an operator mitigation for that failure, not a
required part of an ordinary Ulvia installation.

[`headless-console.py`](../../infra/operations/headless-console.py) discovers the
framebuffer by its console name, checks for a bound Cirrus PCI device and an
active serial console, then detaches only the framebuffer. It never unloads the
driver, stops SSH, disables the serial console or restarts applications. Its
optional [systemd unit](../../infra/operations/ulvia-headless-console.service)
runs this check after device initialization on subsequent boots. Install the
script as `/usr/local/lib/ulvia/headless-console.py` and the unit under
`/etc/systemd/system/` only on a confirmed affected headless host. Enable with
`sudo systemctl enable --now ulvia-headless-console.service`.

Before applying it, save every framebuffer console's original `bind` value.
Rollback disables the unit and writes those original values back to the saved
`/sys/class/vtconsole/vtconN/bind` paths; stopping the oneshot unit alone does
not reattach a console. Keep the original kernel traces for diagnosis. No
kernel replacement or reboot is required to apply or undo the runtime change.

Linux documents this interface in the [framebuffer console guide](https://docs.kernel.org/fb/fbcon.html).

## Invocation preparation

Initial selection, installation and route reads may be shared by an explicit
`GatewayAuthorityReads` context during one operation. The context is bound to a
site and keys its reads by the exact store object, so equally named sites in
different instance stores cannot share data. Failed reads are not retained.
Final signing fences, native receiver checks and new operations read current
state independently. Secret values never enter this context.

Named secret resolution checks metadata-read and resolve permissions together,
then reads one metadata record and one encrypted value. It verifies namespace
and name before reading the value and performs no value or credential caching.

`capabilities.describe` remains a capability invoked through Edge. Its metadata
lookup resolves the exact selected release and pinned ancestors and checks the
selection again before returning. It does not load transport configuration or
attest Provider readiness; actual dispatch retains those checks.

Installations `1.1.0` adds the control-only `gateway.dispatch.prepare` command.
It combines identity resolution, optional root delegation and token issuance.
The Edge sends the resulting business request through ordinary pinned HTTP.
Commands still resolve identity before their start audit. Failed preparation or
transport closes any issued root ticket; a binary response retains it until
completion or cancellation. The official `1.2.0` profile uses manifest `0.3.0`.
Existing published profiles stay pinned. After changing the control contract,
restart the stateless Edge so its startup report selects the exact ready pin.
