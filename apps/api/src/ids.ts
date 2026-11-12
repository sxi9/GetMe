import { randomBytes, randomInt } from 'node:crypto';
export const uid = (prefix = '') => prefix + randomBytes(8).toString('hex');
export const token = () => randomBytes(24).toString('base64url');
export const otp4 = () => String(randomInt(0, 10000)).padStart(4, '0');
export const now = () => new Date().toISOString();
