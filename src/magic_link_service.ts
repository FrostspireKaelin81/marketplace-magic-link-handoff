import { createHash, randomBytes } from "node:crypto";
import type { CaptchaCheck, CaptchaVerifier } from "./infrai_captcha.js";

export interface SignInRequest {
  requestId: string;
  email: string;
  sellerId: string;
  assetId: string;
  orderId: string;
  captcha: CaptchaCheck;
}

export interface SellerAsset {
  sellerId: string;
  assetId: string;
}

export interface OrderHandoff {
  orderId: string;
  asset: SellerAsset;
  buyerEmail: string;
  status: "ready_for_buyer";
  buyerUpdate: string;
}

interface PendingLink {
  email: string;
  orderId: string;
  asset: SellerAsset;
  expiresAt: number;
  consumed: boolean;
}

export class MagicLinkError extends Error {
  readonly kind: "invalid_or_expired" | "already_used";

  constructor(kind: "invalid_or_expired" | "already_used") {
    super(kind === "already_used" ? "Magic link was already used" : "Magic link is invalid or expired");
    this.kind = kind;
  }
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export class MagicLinkService {
  private readonly links = new Map<string, PendingLink>();
  private readonly issuedByRequest = new Map<string, string>();
  private readonly captchaVerifier: CaptchaVerifier;
  private readonly publicOrigin: string;
  private readonly now: () => number;

  constructor(
    captchaVerifier: CaptchaVerifier,
    publicOrigin: string,
    now: () => number = Date.now
  ) {
    this.captchaVerifier = captchaVerifier;
    this.publicOrigin = publicOrigin;
    this.now = now;
  }

  async requestLink(input: SignInRequest): Promise<{ magicLink: string; expiresAt: string }> {
    const existing = this.issuedByRequest.get(input.requestId);
    if (existing) {
      const pending = this.links.get(digest(existing));
      if (pending) return this.linkResult(existing, pending.expiresAt);
    }

    await this.captchaVerifier.verify(input.captcha);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + 15 * 60 * 1_000;
    this.links.set(digest(token), {
      email: input.email,
      orderId: input.orderId,
      asset: { sellerId: input.sellerId, assetId: input.assetId },
      expiresAt,
      consumed: false
    });
    this.issuedByRequest.set(input.requestId, token);
    return this.linkResult(token, expiresAt);
  }

  consume(token: string): OrderHandoff {
    const pending = this.links.get(digest(token));
    if (!pending || pending.expiresAt <= this.now()) throw new MagicLinkError("invalid_or_expired");
    if (pending.consumed) throw new MagicLinkError("already_used");

    pending.consumed = true;
    return {
      orderId: pending.orderId,
      asset: pending.asset,
      buyerEmail: pending.email,
      status: "ready_for_buyer",
      buyerUpdate: "Signed in. The seller asset is ready for handoff."
    };
  }

  private linkResult(token: string, expiresAt: number) {
    const url = new URL("/signin/consume", this.publicOrigin);
    url.searchParams.set("token", token);
    return { magicLink: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
  }
}
