import { CreateImportBody } from "@passform/contracts";
import { createZodDto } from "nestjs-zod";

export class CreateImportBodyDto extends createZodDto(CreateImportBody) {}
