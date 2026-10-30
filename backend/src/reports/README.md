# Suspicious-product reporting

Signed-in farmers can report catalogue or unknown products, with or without package codes. Submission and review do not automatically flag products/codes or change saved verification results.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/reports/catalogue?q=` | Farmer; 20 product names/categories/manufacturers, no package data |
| POST | `/api/reports` | Farmer; owner comes from the session |
| GET | `/api/reports/mine` | Farmer; own reports only |
| GET | `/api/reports` | Administrator; all reports |
| GET | `/api/reports/:id` | Owner farmer or administrator |
| PUT | `/api/reports/:id/review` | Administrator |

Submission requires `productName` (160), `category` (`seed`/`fertilizer`), `reason` and `description` (10–2,000 characters). Optional fields: `productId`, `verificationId`, `codeValue` (80), `sellerName` (160), `sellerLocation` (300), `county` (one of 47 reference counties). A selected catalogue product supplies the authoritative name/category. Unknown and missing codes are accepted. An existing code is linked internally without exposing its match or distribution details to farmers. No attachments are collected.

A linked verification must belong to the farmer and have the same entered code. Its result is saved as a snapshot; private verification reasons are never returned. Report county is optional and self-reported, separate from verification GPS. The form requests no location measurement.

Reports begin `submitted`. Administrators move to `under_review` before `resolved`. Resolution requires a farmer-visible `response` and `resolution` (`action_taken`, `no_action`, `insufficient_information`). Reports can be reopened as `under_review`, clearing resolution. Review bodies accept optional `internalNote` and require numeric `version`; stale versions return 409. Updating a report and appending to `report_reviews` commit in one transaction. Farmer responses exclude internal notes, reviewer/owner identities, matching code IDs and versions.

Lists accept literal, case-insensitive `q` (product/code/seller), `status`, and `page`; newest first, 20 per page. JSON mutations require the application origin and use the existing 8 KiB limit. Submissions allow 20 attempts per farmer per 15 minutes in one API process; multiple instances would need shared limiting. No report editing/deletion endpoint is exposed.

Migration 005 creates report/review tables without replacing existing records. Protected pages: `/farmer/reports/new`, `/farmer/reports`, `/admin/reports`. Run `npm.cmd run reports:test` after building; tests use isolated schemas and cover ownership, privacy, input validation, review conflicts, audit rollback and submission limits.
