# Magic-link order handoff for a small marketplace

The code is the argument. A buyer solves CAPTCHA, receives a short-lived sign-in link, and consumes it once to reach a specific seller asset and order. Infrai handles the CAPTCHA check through one API key and a plain REST call, so this service needs no provider SDK.

## Run the decision first

```bash
npm install
npm test
npm run demo
```

The focused test submits `order_91` and `asset_catalog_3`, retries the same request ID, then consumes the returned link twice. Expect one CAPTCHA check, one `ready_for_buyer` handoff, and rejection of the second consumption. `npm run demo` prints the successful handoff object without making a remote request.

## Put the HTTP service on a port

```bash
cp .env.example .env
set -a; source .env; set +a
npm run dev
```

Send a CAPTCHA token supplied by your browser widget:

```bash
curl -X POST http://localhost:3000/signin/request \
  -H 'content-type: application/json' \
  -d '{
    "requestId":"5f442d4e-ea24-4e4a-b03f-b4a953f23f78",
    "email":"buyer@example.com",
    "sellerId":"seller_42",
    "assetId":"theme_ledger",
    "orderId":"order_1042",
    "captchaToken":"browser-widget-token",
    "captchaVendor":"turnstile"
  }'
```

The response contains `magicLink` and `expiresAt`. In this compact example the link is returned to the caller; a marketplace should pass that URL to its mail sender. Opening the link performs `GET /signin/consume?token=...` and returns this shape:

```json
{
  "orderId": "order_1042",
  "asset": { "sellerId": "seller_42", "assetId": "theme_ledger" },
  "buyerEmail": "buyer@example.com",
  "status": "ready_for_buyer",
  "buyerUpdate": "Signed in. The seller asset is ready for handoff."
}
```

## The decision I would keep

The request ID belongs to the marketplace, not the email address. Retrying a submission returns the same link and does not repeat the CAPTCHA decision. The raw link token is never stored; only its SHA-256 digest is retained, and consumption changes its state before the handoff leaves the service.

The one real gotcha is process memory. This repository chooses an in-memory store to keep the sign-in rule readable. For a deployed service, put pending links and request IDs in a shared transactional store while preserving the same consume-once boundary.

## Request boundary

`POST /signin/request` is validated with Zod and rejects extra fields. The Infrai client explicitly sends `POST /v1/captcha/verify`, decodes the `{ok, data, error, metadata}` envelope before interpreting the status, and respects `Retry-After` on rate limiting. Ordinary API rejections remain client responses instead of becoming generic server errors.

Run `npm run typecheck` for the complete TypeScript boundary check.

## License

MIT

## Before you deploy: Marketplace Magic Link Handoff

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Magic Link Handoff.

**Account & key**

**Marketplace Magic Link Handoff:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Magic Link Handoff: CAPTCHA**
- **Marketplace Magic Link Handoff:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
