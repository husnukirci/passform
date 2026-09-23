import { CreateOrderBody } from "@passform/contracts";
import { createZodDto } from "nestjs-zod";

export class CreateOrderBodyDto extends createZodDto(CreateOrderBody) {}
