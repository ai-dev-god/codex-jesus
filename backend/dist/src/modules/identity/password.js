"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const BCRYPT_ROUNDS = 12;
const hashPassword = async (password) => {
    return bcryptjs_1.default.hash(password, BCRYPT_ROUNDS);
};
exports.hashPassword = hashPassword;
const verifyPassword = async (password, hash) => {
    if (!hash) {
        return false;
    }
    return bcryptjs_1.default.compare(password, hash);
};
exports.verifyPassword = verifyPassword;
