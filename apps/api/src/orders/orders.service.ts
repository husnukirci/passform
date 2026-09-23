import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateOrderBody, OrderResponse } from "@passform/contracts";
import { canonicalJson, isIdempotencyKey, type OrderLineInput } from "@passform/domain";

import { OrdersRepository } from "./orders.repository.js";

/** A first receipt is `201`; a replay under the same key and body is `200` with the stored body. */
export interface CreateOrderResult {
  statusCode: 200 | 201;
  order: OrderResponse;
}

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** sha256 over the canonical, key-sorted JSON body (domain rule; the hashing is Node's). */
export function payloadHash(body: CreateOrderBody): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  async create(key: string | undefined, body: CreateOrderBody): Promise<CreateOrderResult> {
    if (key === undefined) {
      throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} header is required`);
    }
    if (!isIdempotencyKey(key)) {
      throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} must be a UUID`);
    }
    const lines = await this.priceLines(body);
    const outcome = await this.orders.createOrder({ key, payloadHash: payloadHash(body), lines });
    switch (outcome.kind) {
      case "created":
        return { statusCode: 201, order: outcome.order };
      case "replayed":
        return { statusCode: 200, order: outcome.response };
      case "conflict":
        throw new ConflictException(`${IDEMPOTENCY_KEY_HEADER} reused with a different payload`);
      case "out_of_stock":
        throw new ConflictException({
          message: `Insufficient stock for ${outcome.sku}`,
          sku: outcome.sku,
        });
    }
  }

  /** The current unit price of every line's part; an unknown part is the caller's error. */
  private async priceLines(body: CreateOrderBody): Promise<OrderLineInput[]> {
    const prices = await this.orders.partPrices(body.lines.map((line) => line.partId));
    const byId = new Map(prices.map((part) => [part.id, part]));
    return body.lines.map((line) => {
      const part = byId.get(line.partId);
      if (part === undefined) throw new NotFoundException(`part ${line.partId} not found`);
      return { partId: line.partId, qty: line.qty, unitCents: part.priceCents };
    });
  }

  /** The payment stand-in: `placed` becomes `confirmed`, and the stock stays taken. */
  async confirm(id: string): Promise<OrderResponse> {
    if (await this.orders.confirm(id)) return this.get(id);
    const order = await this.get(id);
    if (order.status === "expired") throw new ConflictException("Order has expired");
    return order;
  }

  async get(id: string): Promise<OrderResponse> {
    const order = await this.orders.find(id);
    if (order === null) throw new NotFoundException(`order ${id} not found`);
    return order;
  }
}
