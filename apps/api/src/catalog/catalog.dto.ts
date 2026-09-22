import { PartDetailQuery } from "@passform/contracts";
import { createZodDto } from "nestjs-zod";

export class PartDetailQueryDto extends createZodDto(PartDetailQuery) {}
