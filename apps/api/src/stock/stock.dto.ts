import { StockUpdateBody } from "@passform/contracts";
import { createZodDto } from "nestjs-zod";

export class StockUpdateBodyDto extends createZodDto(StockUpdateBody) {}
