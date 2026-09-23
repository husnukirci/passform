import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CreateImportResponse, ImportStatusResponse } from "@passform/contracts";
import multer from "multer";
import { ZodSerializerDto } from "nestjs-zod";

import { dataDir } from "../infra/data-dir.js";
import { CreateImportBodyDto } from "./imports.dto.js";
import { ImportsService, resolveImportPath } from "./imports.service.js";

/** An uploaded file streams to `$DATA_DIR/imports/uploads/` and is imported from there. */
const uploadStorage = multer.diskStorage({
  destination: (_request, _file, done) => {
    const dir = join(dataDir(), "imports", "uploads");
    mkdir(dir, { recursive: true }).then(
      () => done(null, dir),
      (error: unknown) => done(error instanceof Error ? error : new Error(String(error)), dir),
    );
  },
  filename: (_request, _file, done) => done(null, `${Date.now()}.jsonl`),
});

@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** JSON `{ supplierId, path }` for a file under DATA_DIR, or multipart `file` + `supplierId`. */
  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor("file", { storage: uploadStorage }))
  @ZodSerializerDto(CreateImportResponse)
  async create(
    @Body() body: CreateImportBodyDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<CreateImportResponse> {
    let filePath: string;
    if (file !== undefined) filePath = file.path;
    else if (body.path !== undefined) filePath = await resolveImportPath(body.path);
    else throw new BadRequestException("expected a multipart file or a path under DATA_DIR");
    return this.imports.create({ supplierId: body.supplierId, filePath });
  }

  @Get(":id")
  @ZodSerializerDto(ImportStatusResponse)
  get(@Param("id") id: string): Promise<ImportStatusResponse> {
    return this.imports.get(id);
  }
}
