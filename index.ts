import { Express } from "express";
import { Connection } from "mysql2/promise";
import { initDataBase } from "./src/services/db";
import { initServer } from "./src/services/server";
import { commentsRouter } from "./src/api/comments-api"
import { productsRouter } from "./src/api/products-api";

export let server: Express;
export let connection: Connection;

const ROOT_PATH = "/api";

async function launchApplication() {
  server = initServer();
  connection = await initDataBase();

  initRouter();
}

function initRouter() {
  server.use(`${ROOT_PATH}/comments`, commentsRouter);
  server.use(`${ROOT_PATH}/products`, productsRouter);
}

launchApplication();