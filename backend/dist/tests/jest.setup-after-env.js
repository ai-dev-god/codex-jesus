"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./integration/support/db");
afterAll(async () => {
    await (0, db_1.shutdownDatabase)();
});
