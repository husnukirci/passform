import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // The web app's client islands call the API from the browser.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

await bootstrap();
