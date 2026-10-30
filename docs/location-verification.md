# Current-location web verification and generated package codes

## Administrator workflow

1. Sign in and open **Manage products → Manage → New code**.
2. Enter the number of packages (1–1,000), batch number, manufacture/expiry dates, status and one distribution county.
3. Select **Generate code**. The server generates a 96-bit cryptographically random identifier using Node's `crypto.randomBytes`, encoded with Crockford's Base32 alphabet and grouped for entry, for example `AGV-XXXX-XXXX-XXXX-XXXX-XXXX`.
4. Copy or download the generated codes, one per package. All packages share the submitted batch details and county, but each receives its own identifier. Generation is atomic: either every requested code is saved or none are. Submitting again generates additional packages for the batch.
5. Use **Edit** to record an approved distribution-county change. Printed identifiers cannot be renamed or moved between products.

`codeValue` is rejected on both creation and update. Database uniqueness is authoritative; a collision is retried up to five times without overwriting an existing code. Existing identifiers, including previously printed manual codes, are preserved by migration 004. Codes with no distribution assignment require administrator review and assignment before a new positive result.

## Farmer/guest workflow

The farmer enters a code and clicks **Verify code**. The page briefly explains that location supports the check, then requests one current browser geolocation measurement with permission. It does not track movement or request location on page load. If the user leaves the page, pending verification is cancelled. Rechecking obtains a fresh measurement.

The backend accepts coordinates, accuracy and timestamp, validates them, and derives a county using locally bundled polygons for all 47 Kenyan counties. It never accepts a county supplied by the client or uses the farmer's home county as their current county. No external geocoder receives coordinates. Raw coordinates are used transiently and are not stored; the history retains the derived county, source label, assessment and assignment snapshot.

An otherwise valid active code requires review if:

- Its distribution county has not been assigned.
- No measurement was provided (denied permission, unsupported browser or timeout).
- The measurement is older than two minutes or more than 30 seconds in the future.
- Reported accuracy exceeds 5 km.
- The point is outside Kenya, or its accuracy circle plus a 250 m map allowance overlaps a county boundary.
- The resolved county differs from the saved distribution county.

Existing malformed/unknown/flagged/inactive/expired/future-manufacture outcomes remain in place and never produce a positive match. A location match alone cannot override a product/code flag or expiry.

## Public and administrator results

The public POST response and farmer history show **Verification requires review**, a generic explanation and no product snapshot for all location-related review outcomes. They omit the expected/derived county, location status/source and private reason. There is no public endpoint exposing assignments.

Administrator history exposes the saved internal reason, derived county, device/unavailable source, comparison status and distribution assignment at the time of the check. Later metadata changes never rewrite prior results. Legacy records remain marked as location not checked; older profile counties are explicitly labeled as legacy data.

The browser permission prompt and brief purpose remain visible. Hiding precise comparison rules is not a claim that the use of location is undetectable. The repository is public, so the implementation can be inspected. A knowledgeable client can also forge coordinates, accuracy or timestamps. Browser geolocation is supporting evidence, not trusted physical-location attestation or proof that a package is authentic. Operator location attestation/reuse analysis would be separate future work.

## Local use and tests

Run `npm.cmd run local`; it applies migration 004 before starting servers. Location works on localhost and requires HTTPS on a deployed website. Browser/OS permission, device capability and network environment affect accuracy. A desktop returning a broad accuracy radius may correctly require review; the backend does not silently fall back to a profile or IP county.

`npm.cmd run verification:test` covers county mapping, uncertain boundaries, stale/poor/missing measurements, code format, public-response privacy, location assignment changes and snapshot preservation. `npm.cmd run products:test` covers generated-code collision retries and rejection of chosen codes. `npm.cmd run e2e:test` uses simulated browser coordinates and permission settings to rehearse matched/mismatched/denied/inaccurate cases and administrator-only details. Test users/data are isolated in a temporary schema. Simulated coordinates validate software behavior, not a real device location.

County source, pinned download, license attribution and normalization are recorded in [the boundary data README](../backend/src/location/data/README.md). USSD location collection is not implemented by this change; a future self-reported USSD county must not be presented as device-confirmed location.
