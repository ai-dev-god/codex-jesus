"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labUploadBucket = void 0;
const storage_1 = require("@google-cloud/storage");
const env_1 = __importDefault(require("../config/env"));
const storage = new storage_1.Storage();
exports.labUploadBucket = storage.bucket(env_1.default.LAB_UPLOAD_BUCKET);
exports.default = storage;
