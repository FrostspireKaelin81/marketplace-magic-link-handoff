import assert from "node:assert/strict";
import test from "node:test";
import type { CaptchaVerifier } from "../src/infrai_captcha.js";
import { MagicLinkError, MagicLinkService } from "../src/magic_link_service.js";

test("a verified buyer receives one order handoff from one link", async () => {
  let captchaChecks = 0;
  const verifier: CaptchaVerifier = {
    verify: async () => { captchaChecks += 1; }
  };
  const service = new MagicLinkService(verifier, "https://market.example", () => 1_700_000_000_000);
  const input = {
    requestId: "c21bb825-a450-4778-afb4-294d7154576a",
    email: "buyer@example.com",
    sellerId: "seller_7",
    assetId: "asset_catalog_3",
    orderId: "order_91",
    captcha: { widget_record_id: "widget-record-1", token: "verified-token", action: "marketplace_signin", score_threshold: 0.7 }
  };

  const first = await service.requestLink(input);
  const retried = await service.requestLink(input);
  assert.equal(first.magicLink, retried.magicLink);
  assert.equal(captchaChecks, 1);

  const token = new URL(first.magicLink).searchParams.get("token");
  assert.ok(token);
  assert.deepEqual(service.consume(token), {
    orderId: "order_91",
    asset: { sellerId: "seller_7", assetId: "asset_catalog_3" },
    buyerEmail: "buyer@example.com",
    status: "ready_for_buyer",
    buyerUpdate: "Signed in. The seller asset is ready for handoff."
  });
  assert.throws(() => service.consume(token), (error) =>
    error instanceof MagicLinkError && error.kind === "already_used"
  );
});
