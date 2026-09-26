import { createServer } from "node:http";
import { z } from "zod";
import { InfraiCaptchaVerifier, InfraiError, InfraiTransportError } from "./infrai_captcha.js";
import { MagicLinkError, MagicLinkService } from "./magic_link_service.js";

const linkRequestSchema = z.object({
  requestId: z.string().uuid(),
  email: z.string().email(),
  sellerId: z.string().min(1),
  assetId: z.string().min(1),
  orderId: z.string().min(1),
  widgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
  captchaVendor: z.string().min(1).optional()
}).strict();

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
const service = new MagicLinkService(new InfraiCaptchaVerifier(apiKey), origin);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", origin);

    if (request.method === "POST" && url.pathname === "/signin/request") {
      const body = linkRequestSchema.parse(await readJson(request));
      const result = await service.requestLink({
        requestId: body.requestId,
        email: body.email,
        sellerId: body.sellerId,
        assetId: body.assetId,
        orderId: body.orderId,
        captcha: {
          widget_record_id: body.widgetRecordId,
          token: body.captchaToken,
          vendor: body.captchaVendor,
          ip: request.socket.remoteAddress,
          action: "marketplace_signin",
          score_threshold: 0.7
        }
      });
      send(response, 201, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/signin/consume") {
      const token = z.string().min(1).parse(url.searchParams.get("token"));
      send(response, 200, service.consume(token));
      return;
    }

    send(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) send(response, 400, { error: "invalid_request", issues: error.issues });
    else if (error instanceof InfraiError) send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
    else if (error instanceof InfraiTransportError) send(response, 502, { error: "upstream_response" });
    else if (error instanceof MagicLinkError) send(response, error.kind === "already_used" ? 409 : 400, { error: error.kind });
    else send(response, 500, { error: "request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Marketplace sign-in listening on ${origin}`));
