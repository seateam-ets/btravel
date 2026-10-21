# B-TRAVEL Site et administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one French-language B-TRAVEL application with a public website and the fifteen connected administration functions, then prepare it for launch after its legal, content, security, and domain gates are cleared.

**Architecture:** Add a React/Vite web artifact at the root preview path, use the existing Express API and PostgreSQL/Drizzle packages, and define API contracts in OpenAPI before generating client hooks and validators. Build and test integrated workflows in vertical slices; do not publish the replacement site until all fifteen functions and the go-live checks pass.

**Tech Stack:** pnpm workspace, TypeScript, React, Vite, Express 5, PostgreSQL, Drizzle ORM, Zod, OpenAPI, generated React Query client, Replit-managed authentication, Playwright for browser journeys.

**Spec:** `docs/superpowers/specs/2026-10-21-btravel-redesign-design.md`

## Global Constraints

- "Les quinze fonctions métier du cahier des charges doivent être disponibles au lancement."
- "Site public et administration en français au lancement."
- "Une seule responsable se connecte au départ."
- "Les réservations aux voyages organisés sont des demandes : B-TRAVEL confirme les places et suit les paiements, sans paiement en ligne immédiat."
- "Pour une demande de places, le site demande le contact responsable et le nombre de places. Les noms des passagers sont enregistrés après confirmation."
- "Le planning gère les transports ponctuels et les trajets scolaires récurrents. Les périodes de congés scolaires suspendent ces derniers, avec dates modifiables."
- "La migration se limite aux pages, photos et voyages à venir."
- "Les suppressions exigent une confirmation."
- "Aucune donnée factice ne doit rester dans l’environnement de production."
- Wait for the client's questionnaire and approval before locking the visual direction or building final visual mockups.
- Do not assume the production domain, send email, issue legally configured invoices, migrate private business records, or alter the current live website without the approvals identified in the spec.
- Use the existing workspace API and database rather than adding a second backend or replacing the current stack.
- Keep work in `artifacts/btravel`, `artifacts/api-server`, `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`, `lib/db`, and `scripts`; do not modify the current public site during implementation.

## Review Focus

1. **A visitor double-clicks or retries after a network timeout:** create one request and show a recoverable result. Pin this in the public-form integration tests.
2. **A visitor calls a private URL directly:** receive an authorization error and no private data. Pin this in API and browser auth tests.
3. **Two transports overlap, exceed a vehicle’s capacity, or use an unavailable driver:** reject the conflicting assignment with a clear explanation. Pin this in scheduling domain tests.
4. **A recurring school trip crosses a configured holiday or a one-date exception:** omit only the affected dates and preserve the remaining recurrence. Pin this in recurrence tests, including Europe/Brussels dates.
5. **An invoice is requested before the accountant-approved settings are recorded:** allow a draft but block official issuance. Pin this in billing tests and keep the go-live gate closed.

---

## File Map

- `artifacts/btravel/`: new React/Vite artifact for all public pages and protected `/admin` screens.
- `artifacts/api-server/src/routes/`: Express endpoints, grouped by public submissions and authenticated business modules.
- `artifacts/api-server/src/services/`: business rules for requests, quotes, transport scheduling, trips, documents, and invoices.
- `lib/api-spec/openapi.yaml`: source of truth for public and private API paths and schemas; preserve the existing `info.title: Api`.
- `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`: generated outputs only; never hand-edit generated files.
- `lib/db/src/schema/`: Drizzle tables, split by business responsibility and exported from `index.ts`.
- `scripts/src/`: reviewed public-content migration/import tooling only; never include old private customer, quote, or booking data.
- `artifacts/api-server/src/**/*.test.ts` and `artifacts/btravel/e2e/`: domain/API tests and browser-level user journeys.
- `docs/superpowers/specs/2026-10-21-btravel-redesign-design.md`: approved product specification.

## Interfaces and Shared Domain Rules

Use these shared concepts across the API, generated client, database, and UI. Keep names and status transitions consistent:

```ts
type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
type TripRequestStatus = "pending" | "confirmed" | "declined" | "cancelled";
type PaymentState = "unpaid" | "partial" | "paid";
type TripVisibility = "draft" | "published" | "archived";

type QuoteRequestInput = {
  contactName: string;
  organizationName?: string;
  email: string;
  phone: string;
  transportType: string;
  journeyType: "one_way" | "return";
  departureAt: string;
  returnAt?: string;
  pickupAddress: string;
  destination: string;
  passengerCount: number;
  notes?: string;
};

type TripRequestInput = {
  tripId: string;
  contactName: string;
  email: string;
  phone: string;
  seatCount: number;
};
```

`QuoteStatus` changes to `accepted` only when the responsible B-TRAVEL user records the client’s response. A confirmed trip request is still not an online payment. Passenger names are entered after confirmation. `PaymentState` is derived from recorded amounts and is not a payment-provider state.

Service and test signatures used below:

```ts
declare function postQuoteRequest(
  input: QuoteRequestInput,
  idempotencyKey: string,
): Promise<{ status: number; body: { id: string } }>;
declare function countQuoteRequestsByKey(idempotencyKey: string): Promise<number>;

declare function generateOccurrences(input: {
  startDate: string;
  endDate: string;
  weekdays: number[];
  excludedRanges: Array<{ startDate: string; endDate: string }>;
}): string[];

declare function confirmTripRequest(
  tripId: string,
  requestId: string,
): Promise<{ ok: boolean }>;
declare function getConfirmedSeatCount(tripId: string): Promise<number>;

declare function importApprovedPage(input: {
  sourceUrl: string;
  title: string;
  body: string;
  reviewedAt: Date;
}): Promise<void>;
declare function countPagesBySourceUrl(sourceUrl: string): Promise<number>;

type AuthIdentity = { subject: string; role: string };
type ManagerIdentity = { subject: string; role: "manager" };
declare function requireManager(identity: AuthIdentity | null): ManagerIdentity;
```

For the test excerpts, use `assert` from `node:assert/strict`, `test` from `node:test`, and Playwright's `test`/`expect` from `@playwright/test` in browser suites.

---

### Task 1: Create the B-TRAVEL web artifact

**Files:**
- Create through the artifact bootstrap: `artifacts/btravel/`
- Generated entry points: `artifacts/btravel/src/App.tsx`, `src/main.tsx`, `src/index.css`, `package.json`
- Test: artifact preview at `/`

**Interfaces:**
- Consumes: current API service on `/api`.
- Produces: `@workspace/btravel`, one web workflow at `/`, public and admin route shells.

- [ ] **Step 1: Bootstrap the web artifact with the registered artifact flow**

Call `createArtifact` with `artifactType: "react-vite"`, `slug: "btravel"`, `previewPath: "/"`, title `"B-TRAVEL"` and a description covering the public site and private administration. Do not hand-write or edit the artifact manifest.

- [ ] **Step 2: Add route shells for the approved public and admin paths**

Create initial route shells for `/`, `/services`, `/flotte`, `/voyages`, `/a-propos`, `/devis`, `/contact`, `/admin`, and `/admin/connexion`. Keep final visual styling provisional until the client questionnaire is received and approved.

- [ ] **Step 3: Start the workflow returned by artifact creation**

Restart the registered web workflow using the exact workflow name returned by `createArtifact`. Confirm the root preview loads and routes remain within the artifact path.

- [ ] **Step 4: Check responsive shell and the pre-auth admin shell**

Use browser preview at desktop and mobile sizes. Confirm public shells render and `/admin` does not expose private content before authentication is implemented.

- [ ] **Step 5: Add the browser-test runner**

Run `pnpm --filter @workspace/btravel add -D @playwright/test`, add `test:e2e` as `playwright test` in the artifact package scripts, and add `artifacts/btravel/playwright.config.ts` with the app preview as its base URL.

---

### Task 2: Define and generate the complete API contract

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated: `lib/api-client-react/src/generated/`
- Generated: `lib/api-zod/src/generated/`
- Test: OpenAPI code generation and TypeScript checks

**Interfaces:**
- Consumes: approved domain types above.
- Produces: generated client and Zod validators consumed by every front-end and API task.

- [ ] **Step 1: Add public read and submission operations**

Add `getPublicTrips`, `getPublicTrip`, `createQuoteRequest`, and `createTripRequest`. Public trip responses include only published content. Submission schemas must validate email, phone, required dates, positive passenger counts, and return-date ordering.

Use this contract shape for a public request; the generated client method name comes from the `operationId`:

```yaml
paths:
  /quote-requests:
    post:
      operationId: createQuoteRequest
      tags: [quoteRequests]
      parameters:
        - in: header
          name: Idempotency-Key
          required: true
          schema: { type: string, minLength: 16, maxLength: 100 }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/QuoteRequestInput" }
      responses:
        "201": { description: Request saved }
        "200": { description: Previous request returned for a safe retry }
        "400": { description: Invalid request }
```

- [ ] **Step 2: Add authenticated operations for the fifteen modules**

Define list/detail/create/update operations for clients, quote requests, quotes, transports, recurring routes, vehicles, drivers, mission sheets, invoices, tasks, organized trips, trip requests, passengers, documents, and dashboard summaries. Define a dedicated operation for recording a quote decision and for checking transport-assignment conflicts.

- [ ] **Step 3: Define API responses for failures**

Use stable error responses for invalid input, missing records, unauthenticated access, forbidden access, duplicate submissions, capacity conflicts, schedule conflicts, and unavailable billing configuration. Never return database errors or private fields to public callers.

- [ ] **Step 4: Generate the client and validators**

Run `pnpm --filter @workspace/api-spec run codegen`. Do not edit generated files manually.

- [ ] **Step 5: Verify generated operation names and type consistency**

Run `pnpm run typecheck:libs`. Confirm all public and private operations have generated query/mutation functions and Zod types.

---

### Task 3: Build the database model and development-only migrations

**Files:**
- Create: `lib/db/src/schema/users.ts`
- Create: `lib/db/src/schema/clients.ts`
- Create: `lib/db/src/schema/quote-requests.ts`
- Create: `lib/db/src/schema/quotes.ts`
- Create: `lib/db/src/schema/transports.ts`
- Create: `lib/db/src/schema/recurring-routes.ts`
- Create: `lib/db/src/schema/fleet.ts`
- Create: `lib/db/src/schema/trips.ts`
- Create: `lib/db/src/schema/invoices.ts`
- Create: `lib/db/src/schema/documents.ts`
- Create: `lib/db/src/schema/tasks.ts`
- Modify: `lib/db/src/schema/index.ts`
- Test: `artifacts/api-server/src/services/schema-invariants.test.ts`

**Interfaces:**
- Consumes: OpenAPI schema decisions from Task 2.
- Produces: persisted models for all public and admin workflows; no production seed data.

- [ ] **Step 1: Add customer, request, and quote tables**

Store the requester and organization, contact channels, journey type, timestamps, pickup, destination, passengers, notes, quote status, line items, amounts, decision date, and links between records. Add indexes for email, status, creation date, and linked customer.

- [ ] **Step 2: Add transport, recurrence, vehicle, and driver tables**

Store start/end times, locations, assigned vehicle and driver, vehicle capacity, equipment, availability, recurring weekdays, recurrence date bounds, and editable holiday/exception ranges. Enforce foreign keys and non-negative passenger counts.

The vehicle table must enforce a positive capacity at the database boundary:

```ts
import { boolean, check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [check("vehicles_capacity_positive", sql`${table.capacity} > 0`)],
);
```

- [ ] **Step 3: Add organized trip, trip request, passenger, payment, invoice, task, and document tables**

Keep trip requests distinct from confirmed passenger records. Store payment amounts and dates without any payment-provider token. Store invoice numbering/configuration separately so official issuance can remain disabled until approved.

- [ ] **Step 4: Export every table from the schema index**

Export one table module per file from `lib/db/src/schema/index.ts`; keep the root schema file free of table implementation.

- [ ] **Step 5: Add schema invariant tests**

Test unique identifiers, foreign-key relationships, required fields, valid status enums, and positive vehicle capacities in `artifacts/api-server/src/services/schema-invariants.test.ts`, using a development/test database only.

- [ ] **Step 6: Apply schema only to the development database**

Use `pnpm --filter @workspace/db run push` only after confirming `DATABASE_URL` points to development. Never run `push-force` or change a production schema in this task.

---

### Task 4: Add secure single-manager authentication and route guards

**Files:**
- Create: `artifacts/api-server/src/middlewares/require-auth.ts`
- Create: `artifacts/api-server/src/routes/auth.ts`
- Create: `artifacts/btravel/src/pages/AdminLogin.tsx`
- Create: `artifacts/btravel/src/components/ProtectedAdmin.tsx`
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/middlewares/require-auth.test.ts`
- Test: `artifacts/btravel/e2e/admin-auth.spec.ts`

**Interfaces:**
- Consumes: authenticated API schemas from Task 2 and user table from Task 3.
- Produces: a server-verified administrator identity for every private operation.

- [ ] **Step 1: Select and authorize a Replit-managed identity provider**

Use the managed authentication flow that supports the required email/password login, reset, and secure sessions. Read the applicable auth integration instructions before coding. Ask the user to authorize the chosen provider through the supported connection flow; do not request credentials in chat or implement local password storage.

- [ ] **Step 2: Store the provider subject and manager role**

Map the verified provider identity to one application user with the manager role. Do not create public sign-up or allow a client-submitted role to grant access.

- [ ] **Step 3: Guard all admin APIs on the server**

Return `401` for missing/invalid sessions and `403` for a valid session without the manager role. Apply the guard to every private router, not only to the UI route.

- [ ] **Step 4: Add login, reset, and logout screens**

Use French labels, visible error feedback, keyboard-accessible controls, and a return path to the admin page after successful login.

- [ ] **Step 5: Verify denied and allowed requests**

Test an anonymous request to each protected route, a manager session, expired session, and public route access. Anonymous requests must never return clients, invoices, passengers, or documents.

---

### Task 5: Deliver the client, request, and quote workflow

**Files:**
- Create: `artifacts/api-server/src/routes/quote-requests.ts`
- Create: `artifacts/api-server/src/routes/quotes.ts`
- Create: `artifacts/api-server/src/services/quotes.ts`
- Create: `artifacts/api-server/src/services/quote-pdf.ts`
- Create: `artifacts/api-server/src/services/notifications.ts`
- Create: `artifacts/btravel/src/pages/QuoteRequest.tsx`
- Create: `artifacts/btravel/src/pages/admin/QuoteRequests.tsx`
- Create: `artifacts/btravel/src/pages/admin/QuoteDetail.tsx`
- Test: `artifacts/api-server/src/services/quotes.test.ts`
- Test: `artifacts/btravel/e2e/quote-request.spec.ts`

**Interfaces:**
- Consumes: quote request/quote schemas from Tasks 2-3 and auth guard from Task 4.
- Produces: `POST /api/quote-requests`, admin customer/request/quote operations, and the quote-to-transport conversion input used by Task 6.

- [ ] **Step 1: Add public quote-request validation and persistence**

Validate all form fields server-side. Store the request before returning success. Add a client submission identifier with a unique constraint so retries return the original request instead of creating a duplicate.

Pin retry behavior in the API integration suite:

```ts
const first = await postQuoteRequest(input, "quote-form-submit-0001");
const retry = await postQuoteRequest(input, "quote-form-submit-0001");
assert.equal(first.status, 201);
assert.equal(retry.status, 200);
assert.equal(retry.body.id, first.body.id);
assert.equal(await countQuoteRequestsByKey("quote-form-submit-0001"), 1);
```

- [ ] **Step 2: Add the multi-step French quote form**

Implement the contact, route, and additional-information steps from the approved spec. Preserve entered data when returning to a previous step or recovering from a server error. Do not show success until the API confirms persistence.

- [ ] **Step 3: Add the admin request list and manual request entry**

Show searchable requests, status, received date, and contact. Let the manager add a request from a phone call and attach it to an existing customer when one is found.

- [ ] **Step 4: Create and send quotes without re-entering customer details**

Install `pdf-lib` in the API package with `pnpm --filter @workspace/api-server add pdf-lib`. Generate the PDF from stored quote data, record sent/accepted/declined dates, and let the manager record the client’s answer. Convert an accepted quote to a transport while preserving request and customer links.

- [ ] **Step 5: Connect email notifications after approval**

Only after the user selects and authorizes an email provider and confirms the destination address, send an admin notification and quote email. Email failure must be logged safely and must not roll back a stored request or quote.

- [ ] **Step 6: Verify quote journeys**

Test valid/invalid submissions, duplicate retry, manual entry, quote PDF, each quote decision, and conversion of one accepted quote to exactly one transport.

---

### Task 6: Deliver fleet, drivers, transport planning, and mission sheets

**Files:**
- Create: `artifacts/api-server/src/routes/transports.ts`
- Create: `artifacts/api-server/src/routes/fleet.ts`
- Create: `artifacts/api-server/src/services/scheduling.ts`
- Create: `artifacts/api-server/src/services/recurrence.ts`
- Create: `artifacts/api-server/src/services/mission-sheet.ts`
- Create: `artifacts/btravel/src/pages/admin/Schedule.tsx`
- Create: `artifacts/btravel/src/pages/admin/TransportDetail.tsx`
- Create: `artifacts/btravel/src/pages/admin/Fleet.tsx`
- Create: `artifacts/btravel/src/pages/admin/Drivers.tsx`
- Test: `artifacts/api-server/src/services/scheduling.test.ts`
- Test: `artifacts/api-server/src/services/recurrence.test.ts`
- Test: `artifacts/btravel/e2e/transport-scheduling.spec.ts`

**Interfaces:**
- Consumes: accepted quotes and client records from Task 5; vehicle, driver, transport, and recurrence schemas from Task 3.
- Produces: conflict-checked assignments and printable mission sheets for Task 8.

- [ ] **Step 1: Add vehicle and driver records**

Allow the manager to create and update vehicle capacity/equipment and driver availability. Do not seed fake production vehicles or drivers.

- [ ] **Step 2: Add punctual transport records and calendar views**

Show day, week, and month views with journey times, destinations, client, vehicle, driver, and status. Keep scheduling data in Europe/Brussels local time and store timestamps consistently.

- [ ] **Step 3: Add conflict checks before assignment**

Reject overlapping assignment to the same vehicle or driver. Reject passenger counts above vehicle capacity. Return the conflicting record’s date/time and a French explanation without exposing unrelated client data.

Use half-open intervals so a transport ending at 10:00 does not conflict with one starting at 10:00:

```ts
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && b.start < a.end;
}

assert.equal(
  overlaps(
    { start: new Date("2026-10-21T09:00:00Z"), end: new Date("2026-10-21T10:00:00Z") },
    { start: new Date("2026-10-21T10:00:00Z"), end: new Date("2026-10-21T11:00:00Z") },
  ),
  false,
);
```

- [ ] **Step 4: Add recurring school journeys and editable holiday exceptions**

Generate occurrence dates from weekdays and an explicit start/end range. Exclude configured school-holiday periods and date exceptions; allow the manager to edit those periods without changing the recurrence definition.

Test holiday exclusion against local calendar dates:

```ts
const dates = generateOccurrences({
  startDate: "2026-10-19",
  endDate: "2026-10-30",
  weekdays: [1, 3, 5],
  excludedRanges: [{ startDate: "2026-10-26", endDate: "2026-10-30" }],
});
assert.deepEqual(dates, ["2026-10-19", "2026-10-21", "2026-10-23"]);
```

- [ ] **Step 5: Generate and print mission sheets**

Render a mission sheet from the saved transport, contacts, times, pickup, destination, vehicle, driver, and instructions. Verify the print layout contains the saved values and no private fields from unrelated records.

- [ ] **Step 6: Test conflicts, recurrence, and print output**

Test exact overlaps, partial overlaps, adjacent non-overlapping trips, insufficient capacity, holiday suspension, editable exception dates, and print output.

---

### Task 7: Deliver organized trips, reservations, passenger lists, and payment tracking

**Files:**
- Create: `artifacts/api-server/src/routes/public-trips.ts`
- Create: `artifacts/api-server/src/routes/trips.ts`
- Create: `artifacts/api-server/src/services/trip-requests.ts`
- Create: `artifacts/btravel/src/pages/Trips.tsx`
- Create: `artifacts/btravel/src/pages/TripDetail.tsx`
- Create: `artifacts/btravel/src/pages/admin/Trips.tsx`
- Create: `artifacts/btravel/src/pages/admin/TripRequests.tsx`
- Test: `artifacts/api-server/src/services/trip-requests.test.ts`
- Test: `artifacts/btravel/e2e/trip-registration.spec.ts`

**Interfaces:**
- Consumes: trip/registration schemas from Task 3 and generated public/admin hooks from Task 2.
- Produces: published public trip pages and admin-confirmed requests linked to passenger/payment records.

- [ ] **Step 1: Add admin trip creation and publication**

Store destination, date, description, program, price, departure points, capacity, availability, and publication state. A draft or archived trip must not appear in public results.

- [ ] **Step 2: Add the public trip list and detail pages**

Display only validated values for published trips. Do not display invented prices, departure times, or seat counts. Hide booking submission when the trip is closed or full.

- [ ] **Step 3: Add the reservation request form**

Ask for contact name, e-mail, phone, and requested seat count. Save a pending request without charging the visitor. Prevent the requested plus confirmed seats from exceeding capacity.

- [ ] **Step 4: Add manager confirmation and passenger entry**

Let the manager confirm or decline a request. After confirmation, add passenger names and track unpaid, partial, or paid amounts. Generate a printable passenger list.

- [ ] **Step 5: Test booking capacity and states**

Test that pending requests are not represented as paid, rejected requests do not consume confirmed places, two concurrent confirmations cannot overbook a trip, and passenger names are only added after confirmation.

Run the last-seat check concurrently and assert that only one request is confirmed:

```ts
const results = await Promise.all([
  confirmTripRequest(tripId, requestAId),
  confirmTripRequest(tripId, requestBId),
]);
assert.equal(results.filter((result) => result.ok).length, 1);
assert.equal(await getConfirmedSeatCount(tripId), tripCapacity);
```

---

### Task 8: Deliver invoices, documents, tasks, reminders, and simple statistics

**Files:**
- Create: `artifacts/api-server/src/routes/invoices.ts`
- Create: `artifacts/api-server/src/routes/documents.ts`
- Create: `artifacts/api-server/src/routes/tasks.ts`
- Create: `artifacts/api-server/src/routes/dashboard.ts`
- Create: `artifacts/api-server/src/services/invoices.ts`
- Create: `artifacts/api-server/src/services/document-access.ts`
- Create: `artifacts/btravel/src/pages/admin/Invoices.tsx`
- Create: `artifacts/btravel/src/pages/admin/Documents.tsx`
- Create: `artifacts/btravel/src/pages/admin/Tasks.tsx`
- Create: `artifacts/btravel/src/pages/admin/Dashboard.tsx`
- Test: `artifacts/api-server/src/services/invoices.test.ts`
- Test: `artifacts/api-server/src/services/document-access.test.ts`

**Interfaces:**
- Consumes: accepted transports and clients from Tasks 5-6; trips/payments from Task 7.
- Produces: protected document access, invoice lifecycle and dashboard summaries.

- [ ] **Step 1: Gate official invoice issuance on accountant-approved settings**

Implement invoice drafts and payment tracking. Keep official issue/numbering disabled until B-TRAVEL records the accountant-approved numbering, tax, e-invoicing and export rules. Do not invent tax rates or invoice legal text.

The service must enforce the gate even if a caller bypasses the admin screen:

```ts
export function canIssueInvoice(settings: { accountantApprovedAt: Date | null }) {
  return settings.accountantApprovedAt !== null;
}

assert.equal(canIssueInvoice({ accountantApprovedAt: null }), false);
assert.equal(canIssueInvoice({ accountantApprovedAt: new Date("2026-10-21T10:00:00Z") }), true);
```

- [ ] **Step 2: Generate and print invoices from saved reservations**

Reuse client and transport data. Record invoice total, due date, deposits, payments, remaining balance, and status. Export only validated invoice data. Do not hard-delete an issued invoice.

- [ ] **Step 3: Add private document storage**

Select a private object-storage service before implementation, following its Replit setup instructions. Save metadata and ownership links in PostgreSQL; require authorization for upload, download, and deletion.

- [ ] **Step 4: Add reminders and tasks**

Allow the manager to create, edit, search, and complete reminders for quote follow-up, client calls, transport preparation, and invoice review.

- [ ] **Step 5: Add simple dashboard totals**

Calculate request counts, quote outcomes, completed transports, recorded revenue, and request types from persisted records. Show an explicit empty state instead of fabricated figures.

- [ ] **Step 6: Test billing gates, payments, document permissions, and empty states**

Assert that invoice issuance is rejected before approved configuration exists, partial payments update the balance correctly, anonymous document download fails, and empty databases show zeros rather than sample data.

---

### Task 9: Build the approved public website and the complete admin interface

**Files:**
- Modify: `artifacts/btravel/src/App.tsx`
- Create: `artifacts/btravel/src/pages/public/` for home, services, fleet, about, contact, legal, quote, and trip routes
- Create: `artifacts/btravel/src/pages/admin/` for the seven approved admin areas
- Create: `artifacts/btravel/src/components/` for shared navigation, forms, status labels, confirmations, and print views
- Modify: `artifacts/btravel/src/index.css`
- Test: `artifacts/btravel/e2e/public-site.spec.ts`
- Test: `artifacts/btravel/e2e/admin-workflows.spec.ts`

**Interfaces:**
- Consumes: generated API hooks, authenticated admin layout, and all tested workflows from Tasks 2-8.
- Produces: complete French public and admin interfaces with no fake actions.

- [ ] **Step 1: Receive the client's questionnaire and visual references**

Do not finalize colors, typography, page composition, or animation before the questionnaire and references are supplied and their visual direction is approved.

- [ ] **Step 2: Present and approve public/admin visual mockups**

Create responsive mockups for the homepage, public quote form, trip detail, admin dashboard, and transport calendar. Apply the approved B-TRAVEL brand assets, not copied Scout Motors media or layouts.

- [ ] **Step 3: Implement the public page routes**

Connect services, fleet, about, trip pages, quote form, and contact to real content/API behavior. Every CTA must navigate or submit to a real destination.

- [ ] **Step 4: Implement the admin navigation and forms**

Build Accueil, Demandes et devis, Planning des trajets, Clients, Facturation, Voyages organisés, and Paramètres. Use clear French labels, confirmation messages, search, print controls, and destructive-action confirmation.

- [ ] **Step 5: Verify responsive, keyboard, and print behavior**

Use keyboard-only navigation, visible focus states, labelled inputs, readable contrast, mobile widths, and print preview for quote, invoice, mission sheet, and passenger list.

---

### Task 10: Import reviewed public content and preserve useful URLs

**Files:**
- Create: `scripts/src/btravel-public-import.ts`
- Modify: `scripts/package.json`
- Create: `artifacts/btravel/src/content/` for approved public copy and media metadata
- Create: `artifacts/btravel/src/redirects.ts`
- Test: `scripts/src/btravel-public-import.test.ts`

**Interfaces:**
- Consumes: approved content exports and media from the current public site.
- Produces: public pages, fleet content, and upcoming trips in the new app; no private business records.

- [ ] **Step 1: Obtain and inventory a read-only public content export**

List page URLs, media, and upcoming trips. Exclude test pages, past trips, customer records, requests, registrations, and documents.

- [ ] **Step 2: Review and normalize each public record**

Check text, destination, price, date, times, departure points, capacity, image rights, and status with B-TRAVEL. Mark any unverified field for review instead of displaying a guess.

- [ ] **Step 3: Import only approved public content into development**

Make the import idempotent using the source URL as an external key. Do not create data in production during migration development.

- [ ] **Step 4: Build and test the redirect map**

Retain useful existing URL paths and define one-to-one redirects for changed pages. Confirm the final domain before enabling production redirects.

- [ ] **Step 5: Obtain a content sign-off**

Have B-TRAVEL review every migrated page and upcoming trip. Do not publish unapproved legal text, testimonials, or image assets.

Make the importer safe to run again by keying each record on its source URL:

```ts
await importApprovedPage({ sourceUrl, title, body, reviewedAt });
await importApprovedPage({ sourceUrl, title, body, reviewedAt });
assert.equal(await countPagesBySourceUrl(sourceUrl), 1);
```

---

### Task 11: Run full acceptance, security, accessibility, and launch checks

**Files:**
- Create: `artifacts/btravel/e2e/complete-transport-flow.spec.ts`
- Create: `artifacts/btravel/e2e/complete-trip-flow.spec.ts`
- Create: `artifacts/btravel/e2e/permissions.spec.ts`
- Modify: app test scripts in `artifacts/api-server/package.json` and `artifacts/btravel/package.json`
- Modify: `replit.md` with verified app operations and environment requirements

**Interfaces:**
- Consumes: all fifteen features from Tasks 1-10.
- Produces: documented release readiness report and an approved cutover checklist.

- [ ] **Step 1: Run type checks and generated contract checks**

Run `pnpm run typecheck` and `pnpm --filter @workspace/api-spec run codegen`; fail the release if generated code changes unexpectedly or type checks fail.

- [ ] **Step 2: Run end-to-end transport and trip flows**

Verify a public quote request reaches the admin, is converted once, receives assignments, produces a printable mission sheet, and can proceed to an invoice draft. Verify a trip request is confirmed, passenger names are added, and payments are tracked without online charging.

- [ ] **Step 3: Run security and permission checks**

Verify anonymous access to every private API is denied, the public API never exposes private fields, private documents require an admin session, and repeated public submissions do not create duplicate records.

Include this direct-route browser check:

```ts
test("anonymous visitors cannot see the admin dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/connexion/);
  await expect(page.getByText("Facturation")).not.toBeVisible();
});
```

- [ ] **Step 4: Run accessibility, mobile, performance, SEO, and print checks**

Check keyboard navigation, form labels, contrast, representative mobile widths, public metadata, sitemap output, print layouts, and route redirects.

- [ ] **Step 5: Confirm all production gates**

Require all of the following before production cutover: client questionnaire and visual approval; approved public content and asset rights; accountant-approved invoice rules; authorized notification and private-storage integrations; an approved data-retention period and privacy review; confirmed production domain; backup and restore check; and B-TRAVEL sign-off.

- [ ] **Step 6: Cut over only after explicit approval**

Keep the existing website unchanged until B-TRAVEL approves the cutover plan and domain. Do not publish, change DNS, or replace existing site files as part of testing.

---

## Execution Notes

- Build all modules as testable slices, but do not treat intermediate internal milestones as permission to publish a partial product.
- Before integrating authentication, email, or private object storage, use the relevant Replit integration instructions and obtain account authorization through the platform flow. Never ask for secrets in chat.
- Before invoice issuance, obtain accountant-approved rules. Feature implementation may create drafts first; production issuance remains blocked until approval.
- Before visual implementation, collect and approve the client's questionnaire and assets. The current Scout Motors reference is inspiration for craft only.
- The production domain and launch date remain undecided.
- Do not push commits to GitHub or modify the live WordPress site without the user's explicit approval.
- After each task's tests pass, create one focused conventional commit for that task. Do not mix unrelated files, exports, secrets, or production credentials into a commit.
