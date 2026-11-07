# USSD verification and reporting

The application has a USSD menu engine, an administrator-only browser simulator, farmer PIN settings, and an Africa's Talking-compatible callback. The Africa's Talking sandbox is connected through a temporary HTTPS tunnel. A live handset dialling code has not been provisioned.

## Try the flow locally

1. Run `npm.cmd run local` and open `http://localhost:3000`.
2. To enable personal menus, sign in as a farmer and open **My account → USSD account access**. Enter a Kenyan phone number, the current website password and a separate six-digit PIN twice. Numbers must be unique across accounts. Saving resets previous USSD sessions. Disable or reset access from this same section.
3. Sign in as an administrator. Open **USSD testing** in the workspace sidebar, or `/admin/ussd`. On a small screen, open **Menu** first.
4. Enter a Kenyan phone number and start a session. **1 Verify product** works without a farmer account. Enter an existing printed package code and type the current county name. A unique prefix is accepted; ambiguous prefixes show a shortlist. **9 Browse counties** retains the complete paginated list.
5. **2 Farmer account** asks for the separate PIN. The number must match the farmer's saved phone. Account menus provide verification, reporting, the two most recent checks and the two most recent reports. They include web and USSD activity owned by that farmer.

The simulator saves actual checks and confirmed reports to the local database; it does not invent product records. Reporting uses this shorter flow:

1. Enter a package code, or **9 No code**. Registered codes fill in the product name and category. Unknown or missing codes ask for those details.
2. Choose the concern and enter a 10–80 character description.
3. Enter the current county name, then confirm with **1 Submit**. **2 Add shop details** is optional; **3 Cancel** discards the draft without submitting a report.

Each answer is saved as an unfinished report for 24 hours after the last report answer. **0 Save & exit** also preserves progress. After a timeout, dial again, choose **2 Farmer account**, enter the PIN, and select **1 Continue report**. The unfinished-report menu also offers **2 Discard & start new** and **3 Account menu**. Drafts belong to the farmer account and require fresh PIN authentication after redialling. An older session cannot overwrite resumed progress or submit it twice. Saving a draft creates no report or dashboard activity; only explicit submission enters the existing review workflow.

No SMS is sent. PIN setup can add/change a phone after website-password confirmation; this version does not independently prove phone ownership by OTP. Configure phone ownership verification before a public launch.

## Location and identifiers

USSD uses the existing package codes, including their printed hyphens. No shorter numeric identifier has been introduced. Long codes are supported within the 80-character input limit but may be cumbersome to type.

The selected county is stored as `self_reported`, never as a device measurement. When it matches the private distribution county and the product/code are active, unexpired and not future-dated, the farmer sees **Code matched**, the product name and expiry date. The saved outcome is `verified` with reason `matched`. A mismatch or missing distribution assignment still returns **Verification requires review**. Expired, flagged, inactive, malformed and unknown codes retain the existing precedence. Assigned counties and internal reasons are never returned in the public response. A match is based on the farmer's declaration and does not independently prove physical location or package authenticity. Earlier saved outcomes, including `location_self_reported` review records, remain unchanged.

Both channels feed the dashboard totals. Its verification county chart continues to use device-resolved counties; self-reported USSD locations fall in the unavailable/legacy group. Report counties remain self-reported and are shown normally. Administrator verification details identify the source explicitly. Reports expose their web/USSD channel.

## Africa's Talking connection setup

1. Create a sandbox USSD channel in the Africa's Talking dashboard. Copy the assigned service code, rather than assuming the local simulator's placeholder is diallable.
2. Generate a random callback token, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it only in ignored `backend/.env` as `USSD_CALLBACK_TOKEN`. Set `USSD_SERVICE_CODE` to the exact assigned code **inside double quotes**, for example `USSD_SERVICE_CODE="*384*12345#"`; an unquoted `#` starts an environment-file comment. Leave both empty to disable external callbacks.
3. Expose the backend callback through a public HTTPS URL using a tunnel or deployed service. Keep unrelated backend routes private where possible. Configure the channel's callback as `https://<backend-host>/api/ussd/callback/<token>`. Treat the entire URL as a credential; redact it from proxy/access logs and screenshots. Restart the backend after changing configuration.
4. Use the provider's sandbox simulator to dial its assigned sandbox code. Sandbox channels do not work on actual handsets. A live service is a separate provisioning and billing step; no live code is purchased or enabled by this implementation.

For local sandbox setup, `node scripts/ussd-callback-proxy.mjs` provides a loopback listener on port 3002. A public tunnel can target this listener instead of exposing the full backend. Its only accepted route is form POST `/ussd/<token>`; the proxy forwards to the backend callback using the token in ignored `backend/.env`. Other paths, methods, cookies and Origin headers are not forwarded. Callback bodies and secrets are not logged. The proxy has an 8 KiB input limit and a 6.5-second upstream timeout. Test it with `node --test scripts/ussd-callback-proxy.test.mjs`. Keep the application, proxy, and tunnel running while testing; a temporary tunnel's address must be updated in Africa's Talking after a tunnel restart. The callback URL, tunnel log and downloaded local tools belong under ignored `.artifacts/`.

Callback contract: POST `application/x-www-form-urlencoded` with `sessionId`, `serviceCode`, `phoneNumber`, cumulative `text`, optional `networkCode`. Responses are plain text starting with `CON ` or `END `, capped at 160 characters. Incoming provider callbacks do not need website cookies or an Origin header. They require the callback token and exact configured service code. This token is an application access check, not a provider signature or phone-location attestation. Confirm provider authentication/IP controls and log handling before public use. No Africa's Talking API key is needed merely to receive callbacks; outgoing SMS/OTP would be a separate integration.

Official references: [Node callback examples](https://africastalkingltd.gitbooks.io/mobile-communication-apis/content/node_js/programmer_level.html), [sandbox setup](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox), [live callback setup](https://help.africastalking.com/en/articles/9915125-how-do-i-go-live-with-ussd), [Kenyan character limits](https://help.africastalking.com/en/articles/1284096-what-is-the-character-limit-for-ussd-menus-and-user-input-in-kenya).

## Persistence and checks

Migration 006 adds `ussd_credentials` and `ussd_sessions`, a report channel column, and the new source/reason values. Existing products, codes, accounts, report content and verification records are preserved. PINs use the existing salted scrypt implementation. Five unsuccessful PIN attempts lock access for 15 minutes across sessions; a successful website PIN reset clears the lock. Account suspension, PIN reset, disabling access or changing the number invalidates account menus, including cached private responses.

Migration 007 adds `ussd_report_drafts`. Drafts store only report fields, with an account owner, revision and expiry. They contain no PINs, authentication state or raw callback text. Submission and cancellation clear the saved content and keep a terminal marker until expiry or the next report, preventing stale requests from duplicating submissions. Draft changes, report creation and the callback response commit together. Expired drafts are purged in bounded batches when sessions start.

Sessions expire after five minutes. Phone/service binding and HMAC digests enforce cumulative request order without storing raw callback text or PINs. An atomic row lock commits each transition and its response with the resulting verification/report. Concurrent retries of the latest request return that response without duplicate writes. Out-of-order requests terminate; transactions roll back on failures. Expired rows are retained for a day then purged in bounded batches when sessions start. Without a callback token, the local simulator uses a process-random HMAC key; restarting the backend ends unfinished local sessions. Provider callbacks contain the PIN in cumulative text, so provider/proxy logging must be reviewed separately; application database redaction cannot control third-party logs.

Provider and mobile-network session or inactivity limits can end a session sooner than the application's five-minute limit. The shorter flow and saved drafts reduce lost work; they do not extend the provider's timer. See the official [Kenyan USSD session durations](https://help.africastalking.com/en/articles/1284071-what-is-the-duration-of-a-ussd-session-for-kenyan-telcos). The browser simulator's exact timer is not assumed to match a live network.

Callback and simulator requests are limited to 200 per phone per 15 minutes per process; the local map is bounded to 10,000 entries. Website PIN changes use the existing session, role, origin, JSON-size and attempt controls, plus password reauthentication. Multiple instances need a shared request limiter and scheduled cleanup. Production transport requires HTTPS and appropriate provider gateway controls.

Build the backend, then run `npm.cmd run ussd:test`. The integration suite uses an isolated temporary schema and checks permissions, PIN enrollment/lock/reset, menu budgets, location handling, status precedence, history ownership, binding/expiry, retry deduplication, report cancellation, failure rollback and redaction. The browser rehearsal (`npm.cmd run e2e:test`, after a frontend build) covers farmer PIN setup and the administrator simulator on desktop/mobile.
