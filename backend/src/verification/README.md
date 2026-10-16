# Verification and history

The first milestone supports web checks by guests, farmers and administrators. Existing account and product services supply the records; verification uses PostgreSQL transactions to save the outcome and a snapshot of the public product/batch details before returning success.

| Method | Backend path | Access |
| --- | --- | --- |
| POST | `/api/verifications` | Guest or active account; exact application origin and JSON required |
| GET | `/api/verifications/mine` | Active farmer; server fixes the owner to the signed-in farmer |
| GET | `/api/verifications` | Active administrator; all records |

The browser calls a same-origin Next.js proxy with the same paths. All responses use `Cache-Control: no-store`. POST bodies accept only `{ "code": "..." }`. Farmer IDs, result overrides, county overrides and channels cannot be supplied by the client. Farmer county comes from their profile; administrator checks have no farmer foreign key. Guest checks retain no personal account data.

Checks accept up to 80 characters, trim surrounding whitespace and look up valid codes case-insensitively. The entered case is preserved in history. Valid format matches code creation: ASCII letters/digits first, followed by letters, digits, hyphens or underscores. Empty or malformed bounded strings produce saved `invalid` results. Wrong JSON types, unsupported fields, control characters and overlong strings return 400 without truncating data or saving misleading records.

## Outcome precedence

1. Invalid input: `invalid` / `malformed`.
2. No stored code: `unregistered` / `not_found`.
3. Product or code flagged suspicious: `suspicious` / `product_flagged` or `code_flagged`.
4. Inactive product or code: `inactive` / `product_inactive` or `code_inactive`.
5. Expiry before today's date in Africa/Nairobi: `expired`.
6. Manufacture date after today's date: `inactive` / `not_yet_manufactured`.
7. Otherwise: `verified` / `matched`.

Expiry today is still current. Flags override other matched-record outcomes so a flagged code is never shown positively. A matching record does not confirm the physical contents of a package or regulatory approval; an unknown code alone does not establish counterfeiting. The UI explains these distinctions.

The service locks the matched product/code with a shared row lock while it saves the outcome. This keeps simultaneous administrator edits from changing the details between lookup and history insertion. A persistence failure returns 503, never a successful verification. There is no history insertion for failed service requests.

## History and permissions

Histories contain saved outcomes, reasons, product snapshots, code input and timestamps. Snapshots omit passwords, session tokens, administrator attribution and farmer contact details. Administrator history also identifies account type, farmer name when available, channel and county. Accounts and contact information are not exposed through the guest verification response.

Both lists accept `q`, `result`, `from`, `to` and `page`; administrator history also accepts `actor` (`farmer`, `guest`, `administrator`). Search matches submitted code, saved product name or saved batch number, literally and case-insensitively. Date filters are inclusive Kenyan calendar dates. Results are ordered by saved timestamp and ID, newest first, in groups of 20. There is no client-selectable farmer ID and no public history endpoint.

Migration 003 adds `inactive`, a saved reason, a JSON product snapshot, an actor type, and a result/time index. It preserves previous results and marks old details as `legacy`; it does not fabricate historical snapshots. Editing or inactivating a product/code never rewrites history. Deleting a farmer still preserves records through the existing nullable foreign key.

An expired, malformed or suspended session produces 401 instead of silently recording a guest check. The UI offers sign-in or an explicit sign-out before checking as a guest. POST verification is limited to 60 requests per minute per account, or per direct peer for guests, with a bounded in-memory limiter. Behind the frontend proxy, guest traffic shares the proxy allowance. Public deployment will need a shared limiter with trusted proxy configuration.

USSD, user-submitted reports, regulator integration, exports, charts, password recovery and contact verification remain later milestones. `reported` remains a legacy/reserved result, not an implemented reporting feature.
