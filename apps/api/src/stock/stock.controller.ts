import { Body, Controller, HttpCode, Param, Patch } from "@nestjs/common";
import { StockUpdateResponse } from "@passform/contracts";
import { ZodSerializerDto } from "nestjs-zod";

import { StockUpdateBodyDto } from "./stock.dto.js";
import { StockService } from "./stock.service.js";

@Controller("suppliers")
export class StockController {
  constructor(private readonly stock: StockService) {}

  /** Always `200` once Postgres has committed; `indexed` says whether the alias took it too. */
  @Patch(":id/stock")
  @HttpCode(200)
  @ZodSerializerDto(StockUpdateResponse)
  apply(@Param("id") id: string, @Body() body: StockUpdateBodyDto): Promise<StockUpdateResponse> {
    return this.stock.apply(id, body);
  }
}
