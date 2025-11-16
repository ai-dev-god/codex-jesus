import { Storage } from '@google-cloud/storage';

import env from '../config/env';

const storage = new Storage();

export const labUploadBucket = storage.bucket(env.LAB_UPLOAD_BUCKET);

export default storage;

