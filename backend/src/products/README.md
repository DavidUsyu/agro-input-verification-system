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
| POST | `/api/products/:id/codes/bulk` | Generate 1–1,000 package codes with shared batch metadata |
| PUT | `/api/products/:id/codes/:codeId` | Replace editable code metadata |

Product bodies contain `name`, `category` (`seed` or `fertilizer`), `manufacturer`, optional `registrationNo`, optional `description`, and `status`. The service assigns `createdBy` from the signed-in administrator. It never accepts attribution or timestamps from the client.

Code creation/update bodies contain `batchNumber`, optional `manufactureDate`, `expiryDate`, `status` and `distributionCounty` (one of the 47 reference counties). Creation requires an assigned county; an update may explicitly leave/mark it null so a legacy code can be flagged or inactivated before its county is known. Unassigned codes cannot receive a new positive match. Both reject `codeValue`; the server generates a package identifier and a code cannot be moved between products or renamed. Empty optional fields become null. Dates use `YYYY-MM-DD` (years 1000–9999), are returned as calendar-date strings without timezone conversion, and expiry must not precede manufacture. Expired dates are allowed for historical records; expiry is not a record status.

Bulk creation additionally requires numeric integer `quantity` from 1 to 1000 and returns `{ items: ProductCode[], total: number }`. All packages share the submitted metadata but have different globally unique codes. Generation runs in one database transaction: collisions retry only missing codes, and failure rolls back every code in the request. Single-code POST retains its existing object response. Updates reject quantity and continue to affect one package only. The administrator form uses bulk creation, displays every newly generated code for copying, and offers a plain-text download with one code per line. Requests are separate operations; submitting again adds more packages, even for the same batch.

Both record types support `active`, `inactive`, and `suspicious`. Inactivation retains records and their references; no delete endpoint is provided. Updates leave saved verification outcomes unchanged. Concurrent edits currently use the last saved values.

The generator uses 12 cryptographically random bytes (96 bits), Crockford Base32 and a fixed `AGV-` prefix, without embedding time or location. The existing case-insensitive unique index remains authoritative; an insert collision uses `ON CONFLICT DO NOTHING` and retries up to five times, returning 503 if exhausted. It never overwrites another package's code. Existing printed identifiers remain unchanged. Migration 004 adds the distribution reference; legacy null assignments must be set explicitly by an administrator.

Both lists accept `q`, `status`, and `page`; the product list also accepts `category`. Product search matches name, manufacturer or registration reference; code search matches code or batch. Search is case-insensitive and literal (percent and underscore are not wildcards). Responses contain `items`, `total`, `page`, and `pageSize` (20). Records are ordered by creation time and ID, newest first. IDs are decimal strings. Invalid fields and query parameters return 400; missing records return 404.

## Milestone boundaries

The catalogue stores administrator-supplied records. A saved registration reference does not imply regulatory approval. No real products or codes are seeded automatically. Farmer/guest verification and personal/administrator history use the separate [verification module](../verification/README.md). Automatic code generation is implemented; label printing, bulk import, reporting and a regulatory integration remain later milestones.

Run `npm run products:test` from the repository root after building the backend. Tests use a separate temporary schema, not the application's stored records.
