# hl-auth Payments - Build Plan

## 1. One-Sentence Definition
Add Stripe-backed billing to `hl-auth` so a paid subscription can grant or revoke account access to protected Harmonizer Labs pages without any app handling card data.

## 2. Assumptions
- Default commercial model: recurring account subscriptions, not one-time demo passkeys.
- Default provider: Stripe Billing with Stripe-hosted Checkout and Customer Portal.
- Default access model: paid plans grant entitlements to existing `hl-auth` pages; apps keep calling `/internal/verify`.
- Default MVP signup: user must have an `hl-auth` account before starting Checkout.
- Default tax posture: use Stripe Tax in Checkout where enabled, but final sales-tax/VAT registration decisions need owner/accountant review.
- Important source-control assumption: live VPS source is newer than this local folder for passphrase gates. Reconcile live source before implementing billing code.

## 3. Users & Jobs-to-Be-Done
- Owner/admin: define plans, map plans to pages, see customer/subscription state, manually override access, handle support without editing SQLite by hand.
- Paying member: subscribe, manage billing, update payment method, cancel, and keep access when billing is healthy.
- Integrated app: ask `hl-auth` if a user can open a page; it should not know whether the grant came from a role, manual override, passphrase, or payment.

## 4. Core User Flows
1. Existing member subscribes:
   - User logs in.
   - User opens `/auth/billing`.
   - User chooses a plan.
   - `hl-auth` creates/reuses a Stripe Customer for the user and creates a Checkout Session in `subscription` mode.
   - Stripe redirects back to `/auth/billing/return`.
   - Webhook receives `checkout.session.completed`, then subscription/invoice events.
   - `hl-auth` stores subscription state and page entitlements.
   - `/internal/verify?page=x` starts allowing newly entitled pages.
2. Member manages billing:
   - User opens `/auth/billing`.
   - `hl-auth` creates a Customer Portal Session for that Stripe Customer.
   - User updates card, downloads invoices, changes/cancels subscription in Stripe-hosted UI.
   - Webhooks update local access state.
3. Renewal/failure:
   - Stripe sends invoice/subscription webhooks.
   - `hl-auth` idempotently records each event.
   - If status is active/trialing, grant access through current period.
   - If past_due, keep access only through configured grace.
   - If canceled/unpaid/incomplete_expired, revoke paid entitlements.

## 5. Mental Model
`hl-auth` remains the source of truth for local access decisions, but Stripe is the source of truth for money. A payment event never directly mutates manual role grants; it updates billing state and derived paid entitlements. `allowedPageIds(user)` becomes: role grants minus explicit denies plus manual grants plus active paid entitlements. Explicit per-user deny must still win over paid access.

## 6. Data Model
Existing tables to preserve:
- `users`: local identity.
- `pages`: app/page registry and access mode.
- `roles`, `role_pages`, `user_roles`: admin-managed access.
- `user_page_overrides`: manual grant/deny.
- `sessions`, `audit`, `settings`.

New tables:
- `billing_customers`
  - `user_id primary key`
  - `stripe_customer_id unique not null`
  - `email`
  - `created_at`, `updated_at`
- `billing_plans`
  - `id primary key`
  - `label`
  - `description`
  - `stripe_price_id unique not null`
  - `stripe_product_id`
  - `active integer not null default 1`
  - `created_at`, `updated_at`
- `billing_plan_pages`
  - `plan_id references billing_plans(id)`
  - `page_id references pages(id)`
  - primary key `(plan_id, page_id)`
- `billing_subscriptions`
  - `stripe_subscription_id primary key`
  - `stripe_customer_id not null`
  - `user_id references users(id)`
  - `plan_id references billing_plans(id)`
  - `status`
  - `current_period_start`, `current_period_end`
  - `cancel_at_period_end integer`
  - `grace_until`
  - `created_at`, `updated_at`
- `billing_events`
  - `stripe_event_id primary key`
  - `event_type not null`
  - `object_id`
  - `object_type`
  - `received_at`
  - `processed_at`
  - `status`: `processing | processed | ignored | failed`
  - `error`

Derived access:
- Add `paidPageIds(userId)` in billing module.
- Update `allowedPageIds(userId)` to union paid pages after role/manual grants, then apply explicit denies last.
- Unknown billing status must fail closed: no paid entitlement unless a local subscription record is active/trialing or within grace.

## 7. Stack
- Stripe official Node SDK: required for Checkout Sessions, Customer Portal Sessions, webhook signature verification, and typed helper behavior.
- SQLite via existing `better-sqlite3`: fits the current single-writer `hl-auth` architecture and lets webhook processing run in transactions.
- Express server-rendered pages: consistent with current admin/account UI.
- Stripe-hosted Checkout and Customer Portal: keeps card entry and subscription management out of `hl-auth`, reducing PCI scope and UI complexity.

## 8. Architecture
```text
browser
  -> /auth/billing
  -> hl-auth creates Checkout/Portal session
  -> stripe-hosted Checkout or Portal
  -> /auth/billing/return

Stripe
  -> /auth/webhooks/stripe
  -> verify signature with raw body
  -> idempotent event table
  -> update billing_subscriptions
  -> paidPageIds affects /internal/verify

apps
  -> /internal/verify?page=x
  -> hl-auth checks roles, overrides, passphrases, paid entitlements
```

Critical Express ordering:
- Stripe webhook must be mounted before `express.json()`, using `express.raw({ type: "application/json" })`, because Stripe signature verification requires the raw request body.

## 9. AI / Algorithm / Decision Logic
N/A - no AI decision logic. The only decision logic is deterministic entitlement resolution:
1. Load user roles/manual overrides.
2. Load active paid plans.
3. Union role grants, manual grants, and paid grants.
4. Remove explicit denies.
5. Admin/master behavior remains unchanged.

## 10. Design Language
Keep billing UI quiet and administrative, matching existing `hl-auth` pages:
- Account page gets a "Billing" section.
- Admin page gets a "Billing plans" table.
- No custom credit-card forms.
- Every billing action should have a clear status: "active", "trialing", "past due", "canceled", "no subscription".
- Never show raw Stripe payloads, card details, or long IDs to normal users.

## 11. Security, Privacy & Compliance
- Do not store card numbers, CVC, or payment method details.
- Use Stripe Checkout and Portal for hosted payment collection and subscription management.
- Verify Stripe webhook signatures using the endpoint secret.
- Store only Stripe IDs and minimal subscription state in SQLite.
- Process webhooks idempotently; duplicate events must not duplicate grants or audit rows.
- Restrict webhook endpoint to required Stripe event types in the Stripe Dashboard.
- Consider Stripe IP allowlisting at nginx as defense-in-depth, but signature verification remains mandatory.
- Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only in `.env`/Docker secrets, never in source.
- Audit all entitlement changes: checkout created, subscription updated, entitlement granted/revoked, portal opened, webhook failed.
- PCI: hosted Checkout reduces card-data handling, but the business still has PCI responsibilities and should complete Stripe Dashboard compliance tasks.
- Taxes: Stripe Tax can calculate tax in Checkout, but registration/remittance obligations need owner/accountant confirmation.
- Refund policy, terms, privacy policy, and contact/support route should be in place before going public.

Official Stripe references checked July 8, 2026:
- Checkout Sessions: https://docs.stripe.com/api/checkout/sessions/create
- Customer Portal Sessions: https://docs.stripe.com/api/customer_portal/sessions/create
- Webhooks and signature verification: https://docs.stripe.com/webhooks and https://docs.stripe.com/webhooks/signature
- Subscription webhooks/statuses: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe Tax with Checkout: https://docs.stripe.com/tax/checkout
- Stripe security/PCI guide: https://docs.stripe.com/security/guide

## 12. Constraints
Hard constraints:
- Webhooks, not browser redirects, grant access.
- Access must fail closed if Stripe is down or webhook verification fails.
- Billing code must not break existing passphrase, member, restricted, owner, or master behavior.
- Explicit admin deny beats paid entitlement.
- Implementation must start from live VPS source or first sync live source into the local folder.

Soft constraints:
- SQLite is acceptable for current scale; move to Postgres only if multi-writer or high-volume webhooks become real.
- Email notifications can start as Stripe-managed receipts/portal emails, then add local email later.
- Plan management can start as owner-only config rows, then become polished admin UI.

## 13. Pitfalls
- Treating Checkout redirect as payment proof. Redirects can be skipped, replayed, or fail; only signed webhooks should provision.
- Mounting webhook after `express.json()`. That breaks Stripe signature verification because the raw body is gone.
- Mixing paid grants into `user_page_overrides`. That makes cancellation/refund cleanup brittle and pollutes manual admin state.
- Granting on `checkout.session.completed` alone. A subscription can still be incomplete or later fail; subscription/invoice events must reconcile state.
- Removing access immediately on transient `past_due`. That may create churn during normal retry/dunning; use a small explicit grace window.
- Listening to every Stripe event. It increases load and noise; subscribe only to required event types.
- Storing full webhook payloads forever. Stripe events may include billing PII; store minimal IDs/state unless there is a clear retention policy.
- Implementing custom card UI. It increases PCI/security burden for no benefit here.
- Letting a paid plan grant owner/admin pages by accident. Plan-page mapping needs validation against protected page IDs.

## 14. MVP Scope
In:
- Stripe SDK dependency.
- Env config for billing.
- Billing schema migrations.
- Billing service module.
- User billing page with subscribe/manage buttons.
- Admin plan mapping table.
- Checkout Session creation for existing logged-in users.
- Customer Portal Session creation.
- Stripe webhook endpoint with raw body + signature verification.
- Idempotent processing for subscription/invoice lifecycle events.
- Entitlement resolver integrated into `allowedPageIds`.
- Tests with mocked Stripe client plus webhook signature fixtures.

Out:
- Guest checkout creating accounts.
- Usage-based metering.
- Coupons/promo codes in local UI.
- Multi-currency plan selection.
- Custom invoices outside Stripe.
- Local email system.
- Connect marketplace/platform payouts.

MVP success metric:
- In Stripe test mode, a subscription to a configured price grants a restricted page within one webhook delivery and revokes it after cancellation/unpaid state, without touching manual overrides.

## 15. Full Scope
- Paid signup flow: checkout first, then claim account from a secure post-payment link.
- Multiple tiers: member, supporter, pro, private beta.
- Plan upgrades/downgrades through Customer Portal.
- Grace/dunning UI on `/auth/account`.
- Admin billing dashboard with customer lookup.
- Refund/dispute support workflow.
- Stripe Tax enabled and verified for required jurisdictions.
- Optional Stripe entitlements integration if product-feature mapping grows beyond local page grants.
- Optional monthly reconciliation job that fetches active Stripe subscriptions and compares them with local records.

## 16. Testing Strategy
Unit tests:
- `paidPageIds` for active/trialing/past_due/canceled/unpaid/incomplete statuses.
- explicit deny wins over paid page grant.
- plan-page mapping rejects owner/admin-only page IDs if configured.

Integration tests:
- `/auth/billing/checkout` requires session and creates a Checkout Session with correct price/customer/metadata.
- `/auth/billing/portal` requires a customer and returns a Stripe portal URL.
- `/auth/webhooks/stripe` rejects bad signatures.
- duplicate webhook event IDs are ignored after first processing.
- subscription status transitions grant/revoke access.

External test-mode verification:
- Stripe CLI `listen` to local webhook.
- Stripe test Checkout subscription.
- cancellation in Customer Portal.
- failed payment/test card scenario.
- Stripe test clocks for renewal and trial boundaries.

## 17. Observability
Audit actions:
- `billing_checkout_created`
- `billing_portal_created`
- `billing_webhook_received`
- `billing_webhook_processed`
- `billing_webhook_failed`
- `billing_subscription_updated`
- `billing_entitlement_granted`
- `billing_entitlement_revoked`

Operational checks:
- count failed webhooks in last hour/day.
- subscriptions with unknown `plan_id`.
- active Stripe subscriptions with no local user.
- local paid entitlements past `current_period_end + grace`.
- webhook endpoint latency and non-2xx response count.

## 18. Build Order
Phase 0 - reconcile source:
1. Snapshot live `/home/harmonizer/hl-auth`.
2. Copy live passphrase-aware source into local workspace or choose VPS as implementation source.
3. Run the existing test suite against that source.

Phase 1 - foundation:
1. Add Stripe dependency and config.
2. Add billing schema migrations.
3. Add billing service with a fake/mockable Stripe client boundary.
4. Add entitlement resolver and tests without calling Stripe.

Phase 2 - Checkout/Portal:
1. Add `/auth/billing` page.
2. Add checkout and portal POST routes.
3. Add env and Stripe Dashboard setup docs.

Phase 3 - webhooks:
1. Mount raw webhook route before JSON parser.
2. Verify signatures.
3. Store/process events idempotently in transactions.
4. Reconcile subscription status into local entitlements.

Phase 4 - admin and deployment:
1. Admin plan mapping UI.
2. Stripe test-mode end-to-end.
3. Configure nginx/body limits/rate limits for webhook and billing routes.
4. Deploy test mode to VPS.
5. Flip to live mode only after terms/tax/refund/privacy checklist is done.

## 19. Agent Handoff Notes
- Do not implement billing against the stale local source without reconciling the live passphrase code first.
- Keep Stripe-specific logic in a new `src/billing/` module; do not scatter Stripe calls through authz/routes.
- Keep browser routes separate from webhook route.
- Webhook handler must be idempotent and transactional.
- The access resolver must preserve existing semantics exactly: public/passphrase/member/restricted, master, owner/admin, explicit deny.
- Never grant access from the success redirect.
- Do not store card data or full webhook payloads unless the owner approves a retention policy.

## 20. Open Decisions
1. Commercial model:
   - Option A: subscriptions to account access. Recommended for MVP.
   - Option B: one-time paid passkeys for demos. Better for public art/demo access but weaker for recurring revenue.
   - Blocks build? No, MVP assumes subscriptions.
2. Plan tiers and prices:
   - Option A: one supporter plan grants a small restricted set.
   - Option B: multiple tiers grant different page groups.
   - Blocks build? Yes for dashboard setup, not for code scaffolding.
3. Account timing:
   - Option A: account before checkout. Recommended for MVP.
   - Option B: checkout before account, then claim account from paid link.
   - Blocks build? No, MVP assumes account first.
4. Tax registration:
   - Option A: enable Stripe Tax and register where required.
   - Option B: leave tax disabled until sales volume/jurisdiction is known.
   - Blocks launch? Yes, owner/accountant decision.
5. Grace policy:
   - Option A: 2-day grace after current period for payment issues.
   - Option B: revoke immediately on any non-active status.
   - Blocks implementation? No, use `BILLING_GRACE_DAYS`.
6. Refund/dispute behavior:
   - Option A: refunds do not revoke unless subscription canceled.
   - Option B: refund immediately revokes associated entitlement.
   - Blocks launch? Support-policy decision.
