# Product management

Only active administrators can access `/api/products` and its child endpoints. The global session guard enforces this on every API request. The browser uses the same-origin Next.js `/api/products` proxy; session cookies remain HttpOnly. Mutation requests require the exact configured `FRONTEND_ORIGIN` and JSON, with the existing 8 KiB request-body limit.

## Endpoints

| Method | Backend path | Purpose |
| --- | --- | --- |
| GET | `/api/products` | Paginated catalogue |
| POST | `/api/products` | Create a product |
| GET | `/api/products/:id` | Read a product and its code count |
| PUT | `/api/products/:id` | Replace editable product fields |
| GET | `/api/products/:id/codes` | Paginated codes for one product |
| POST | `/api/products/:id/codes` | Add a unique verification code |
| PUT | `/api/products/:id/codes/:codeId` | Replace editable code metadata |

Product bodies contain `name`, `category` (`seed` or `fertilizer`), `manufacturer`, optional `registrationNo`, optional `description`, and `status`. The service assigns `createdBy` from the signed-in administrator. It never accepts attribution or timestamps from the client.

Code creation bodies contain `codeValue`, `batchNumber`, optional `manufactureDate`, `expiryDate`, and `status`. Code updates accept the same metadata but reject `codeValue`; a code cannot be moved between products or renamed. Empty optional fields become null. Dates use `YYYY-MM-DD` (years 1000–9999), are returned as calendar-date strings without timezone conversion, and expiry must not precede manufacture. Expired dates are allowed for historical records; expiry is not a record status.

Both record types support `active`, `inactive`, and `suspicious`. Inactivation retains records and their references; no delete endpoint is provided. Updates leave saved verification outcomes unchanged. Concurrent edits currently use the last saved values.

Codes are normalized to uppercase. New values use ASCII letters, digits, hyphens and underscores, start with a letter or digit, and have at most 80 characters. The existing case-insensitive unique database index also prevents duplicate concurrent submissions. A duplicate produces HTTP 409 with a usable message. Existing migration files and stored records are unchanged.

Both lists accept `q`, `status`, and `page`; the product list also accepts `category`. Product search matches name, manufacturer or registration reference; code search matches code or batch. Search is case-insensitive and literal (percent and underscore are not wildcards). Responses contain `items`, `total`, `page`, and `pageSize` (20). Records are ordered by creation time and ID, newest first. IDs are decimal strings. Invalid fields and query parameters return 400; missing records return 404.

## Milestone boundaries

The catalogue stores administrator-supplied records. A saved registration reference does not imply regulatory approval. No real products or codes are seeded automatically. Farmer/guest verification and personal/administrator history use the separate [verification module](../verification/README.md). Code generation/printing, bulk import, reporting and a regulatory integration remain later milestones.

Run `npm run products:test` from the repository root after building the backend. Tests use a separate temporary schema, not the application's stored records.
