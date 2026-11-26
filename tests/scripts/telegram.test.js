import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { escapeHtml, sendMessage, getOrCreateTopicId } from '../../scripts/telegram.js';

describe('telegram.js Unit Tests', () => {
    let tempDir;

    beforeEach(() => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = 'mock-chat-id';
        tempDir = mkdtempSync(join(tmpdir(), 'telegram-unit-'));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test('escapeHtml escapa <, >, &, " e texto que já contém entidades', () => {
        assert.strictEqual(escapeHtml('R&I <teste> "aspas"'), 'R&amp;I &lt;teste&gt; &quot;aspas&quot;');
        assert.strictEqual(escapeHtml('A &amp; B &lt;tag&gt;'), 'A &amp;amp; B &amp;lt;tag&amp;gt;');
        assert.strictEqual(escapeHtml(null), '');
        assert.strictEqual(escapeHtml(undefined), '');
    });

    test('sendMessage desiste após N erros 429 (retry limitado)', async () => {
        let attempts = 0;
        global.fetch = async () => {
            attempts++;
            return {
                ok: false,
                json: async () => ({
                    ok: false,
                    error_code: 429,
                    parameters: { retry_after: 1 },
                    description: 'Too Many Requests',
                }),
            };
        };

        const result = await sendMessage('teste', null, {
            maxRetries: 3,
            sleepFn: async () => {},
        });

        assert.strictEqual(result, false);
        assert.strictEqual(attempts, 3);
    });

    test('sendMessage consegue enviar após erro 429 temporário dentro do limite', async () => {
        let attempts = 0;
        global.fetch = async () => {
            attempts++;
            if (attempts < 2) {
                return {
                    ok: false,
                    json: async () => ({
                        ok: false,
                        error_code: 429,
                        parameters: { retry_after: 1 },
                    }),
                };
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };

        const result = await sendMessage('teste', null, {
            maxRetries: 3,
            sleepFn: async () => {},
        });

        assert.strictEqual(result, true);
        assert.strictEqual(attempts, 2);
    });

    test('getOrCreateTopicId desiste após N erros 429', async () => {
        let attempts = 0;
        global.fetch = async () => {
            attempts++;
            return {
                ok: false,
                json: async () => ({
                    ok: false,
                    error_code: 429,
                    parameters: { retry_after: 1 },
                }),
            };
        };

        const topicId = await getOrCreateTopicId('pesquisa', {
            topicsRegistryFile: join(tempDir, 'topics.json'),
            maxRetries: 2,
            sleepFn: async () => {},
        });

        assert.strictEqual(topicId, null);
        assert.strictEqual(attempts, 2);
    });
});
