import { loadEnv } from './load-env.js';

loadEnv();

export const PORTAL_URL = process.env.PORTAL_URL || 'https://rafaeldeps.github.io/portal_edital';
