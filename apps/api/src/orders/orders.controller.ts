import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from "@nestjs/common";
import { OrderResponse } from "@passform/contracts";
import type { Response } from "express";
import { ZodSerializerDto } from "nestjs-zod";

import { CreateOrderBodyDto } from "./orders.dto.js";
import { IDEMPOTENCY_KEY_HEADER, OrdersService } from "./orders.service.js";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** `201` on first receipt, `200` with the stored body on a replay; the service decides which. */
  @Post()
  @ZodSerializerDto(OrderResponse)
  async create(
    @Headers(IDEMPOTENCY_KEY_HEADER) key: string | undefined,
    @Body() body: CreateOrderBodyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderResponse> {
    const { statusCode, order } = await this.orders.create(key, body);
    response.status(statusCode);
    return order;
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @ZodSerializerDto(OrderResponse)
  confirm(@Param("id") id: string): Promise<OrderResponse> {
    return this.orders.confirm(id);
  }

  @Get(":id")
  @ZodSerializerDto(OrderResponse)
  get(@Param("id") id: string): Promise<OrderResponse> {
    return this.orders.get(id);
  }
}
