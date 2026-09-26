import { MagicLinkService } from "./magic_link_service.js";

const service = new MagicLinkService(
  { verify: async () => undefined },
  "http://localhost:3000",
  () => Date.parse("2026-01-15T12:00:00.000Z")
);

const issued = await service.requestLink({
  requestId: "5f442d4e-ea24-4e4a-b03f-b4a953f23f78",
  email: "buyer@example.com",
  sellerId: "seller_42",
  assetId: "theme_ledger",
  orderId: "order_1042",
  captcha: { widget_record_id: "demo-widget-record", token: "demo-captcha", action: "marketplace_signin", score_threshold: 0.7 }
});

const token = new URL(issued.magicLink).searchParams.get("token");
if (!token) throw new Error("Issued link did not contain a token");
console.log(service.consume(token));
