"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = global.__prismaClient ??
    new client_1.PrismaClient({
        log: ['error', 'warn']
    });
if (process.env.NODE_ENV !== 'production') {
    global.__prismaClient = prisma;
}
exports.default = prisma;
