# Alipay PC QR Repair Design

Date: 2026-04-16

## Summary

Fix the current PC-side Alipay checkout flow so that:

- The inline QR code is a real Alipay scan-to-pay code instead of a QR rendering of the `alipay.trade.page.pay` page URL.
- The checkout dialog still exposes a fallback button that opens the Alipay PC cashier page in a popup or new window.
- Mobile Alipay behavior remains unchanged and continues to use the existing H5/WAP redirect flow.

## Current Problem

The current desktop Alipay provider implementation calls `alipay.trade.page.pay` and writes the returned page URL into both `pay_url` and `qr_code`.

That creates an invalid product behavior:

- Frontend components treat `qr_code` as raw QR payload and render it into a canvas.
- The rendered QR therefore points to the Alipay web cashier page.
- Users who scan with Alipay are redirected into a web payment page and may need to enter a password in the web flow instead of going through the native in-app scan payment experience.

## Goals

- Desktop Alipay orders return both:
  - a native scan QR payload
  - a fallback cashier URL
- The payment dialog shows both the QR code and a fallback "open cashier" action at the same time.
- Existing payment polling, order lifecycle, webhook handling, and mobile Alipay flows continue to work without behavioral regression.

## Non-Goals

- No change to WeChat Pay behavior.
- No change to Stripe behavior.
- No attempt to force-launch Alipay app from desktop browsers with custom scheme hacks.
- No change to payment configuration UI or provider instance schema.

## Recommended Approach

### Backend

Update the Alipay direct provider in [backend/internal/payment/provider/alipay.go](/Users/iuh/IdeaProjects/GithubProjects/sub2api/backend/internal/payment/provider/alipay.go).

For `req.IsMobile == true`:

- Keep the existing `alipay.trade.wap.pay` flow.
- Return `pay_url` only.

For desktop (`req.IsMobile == false`):

- Generate a fallback cashier URL with `alipay.trade.page.pay` and return it as `pay_url`.
- Generate the QR payload with Alipay precreate and return the upstream `qr_code` as `qr_code`.
- Keep the same order identifiers, amount, subject, notify URL, and return URL for both calls so order tracking remains consistent.

This changes the desktop response shape from "one page URL reused twice" to "one native QR payload plus one cashier page URL".

### Frontend

Update the payment waiting UI so QR and fallback link are not mutually exclusive.

Files expected to change:

- [frontend/src/components/payment/PaymentQRDialog.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/components/payment/PaymentQRDialog.vue)
- [frontend/src/components/payment/PaymentStatusPanel.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/components/payment/PaymentStatusPanel.vue)
- [frontend/src/views/user/PaymentQRCodeView.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/views/user/PaymentQRCodeView.vue) if this legacy page is still used

Required UI behavior:

- If `qr_code` exists, render the QR canvas exactly as before.
- If `pay_url` also exists, still show the existing fallback button below or alongside the QR section.
- Keep countdown, cancel, and polling logic unchanged.
- Keep popup reopening behavior unchanged for the fallback button.

### Data Contract

No API field additions are required.

Existing fields already support the target behavior:

- `qr_code`: now contains the real Alipay scan QR payload on desktop
- `pay_url`: contains the desktop cashier page URL

`CreateOrderResult` stays structurally unchanged.

## Error Handling

- If desktop Alipay precreate fails, the order creation should fail rather than silently degrade back to the broken QR behavior.
- If the cashier page URL generation fails, the order creation should also fail, because the approved design requires both desktop paths.
- Existing webhook and query-order handling remain unchanged because payment confirmation is still keyed by the same `out_trade_no`.

## Testing

### Backend Tests

Add provider-level tests for Alipay:

- Mobile request returns only `pay_url`.
- Desktop request returns both `qr_code` and `pay_url`.
- Desktop `qr_code` is sourced from precreate, not copied from `pay_url`.

Prefer isolating SDK calls behind minimal stubbing seams in the provider test so the test asserts behavior, not SDK internals.

### Frontend Tests

Add or update component tests so that:

- QR remains visible when `qrCode` is present.
- Fallback button is also visible when both `qrCode` and `payUrl` are present.
- Popup-only mode still works when `qrCode` is absent and `payUrl` is present.

## Risks and Mitigations

### Risk: desktop branch now performs two upstream calls

Mitigation:

- Keep the logic constrained to Alipay desktop only.
- Reuse the same request parameters across both calls.
- Add focused tests around desktop response composition.

### Risk: frontend layout regression when QR and fallback button coexist

Mitigation:

- Keep the existing layout and only remove the mutual exclusion that hides the button in QR mode.
- Cover the combined state in component tests.

## Implementation Outline

1. Add desktop Alipay response composition in the provider.
2. Add failing tests for desktop/mobile provider behavior.
3. Update payment UI components to render QR and fallback action together.
4. Add frontend tests for the combined state.
5. Verify targeted backend and frontend test suites.

## Acceptance Criteria

- On desktop, creating an Alipay order returns both a valid `qr_code` and a valid `pay_url`.
- The user-facing payment dialog displays the QR code and an "open cashier" fallback button together.
- Scanning the QR code no longer routes users into the current broken web-password flow caused by QR-encoding the page-pay URL.
- Mobile Alipay orders still redirect through the existing H5/WAP path.
- Existing order polling and payment completion flow continue to work.
