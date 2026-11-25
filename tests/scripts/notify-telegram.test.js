import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../scripts/notify-telegram.js';

describe('notify-telegram.js Unit Tests', () => {
    let tempDir;
    let dataDir;
    let registryDir;
    let registryFile;

    beforeEach(() => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = 'mock-chat-id';
        
        tempDir = mkdtempSync(join(tmpdir(), 'notify-test-'));
        dataDir = join(tempDir, 'data');
        registryDir = join(tempDir, 'registry');
        registryFile = join(registryDir, 'downloads_registry.json');
        
        mkdirSync(dataDir);
        mkdirSync(registryDir);

        // Mock fetch globally
        global.fetch = async (url) => {
            if (url.includes('createForumTopic')) {
                return {
                    ok: true,
                    json: async () => ({ ok: true, result: { message_thread_id: 123 } }),
                    text: async () => JSON.stringify({ ok: true, result: { message_thread_id: 123 } })
                };
            }
            return { 
                ok: true, 
                text: async () => 'ok',
                json: async () => ({ ok: true })
            };
        };
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test('Should detect a new edital and update registry', async () => {
        const testEdital = {
            nome: "Edital Teste",
            descrição: "Descrição de teste",
            link: "https://test.com",
            categoria: "bolsas",
            cronograma: [{ evento: "Início", data: "2026-01-01" }]
        };
        
        writeFileSync(join(dataDir, 'test.json'), JSON.stringify(testEdital));
        
        await run(dataDir, registryFile);
        
        assert.ok(existsSync(registryFile), 'Registry file should be created');
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['test.json'], 'test.json should be in registry');
        assert.strictEqual(registry['test.json'].categoria, 'bolsa');
    });

    test('Should skip already registered editais', async () => {
        const initialRegistry = {
            'existing.json': { data_entrada: '2026-01-01T00:00:00.000Z' }
        };
        writeFileSync(registryFile, JSON.stringify(initialRegistry));
        
        // Create the file but it's already in registry
        writeFileSync(join(dataDir, 'existing.json'), JSON.stringify({ nome: "Existing" }));
        
        // Mock fetch to track calls
        let fetchCalled = false;
        global.fetch = async (url) => {
            fetchCalled = true;
            return { 
                ok: true, 
                text: async () => 'ok',
                json: async () => ({ ok: true })
            };
        };

        await run(dataDir, registryFile);
        
        assert.strictEqual(fetchCalled, false, 'Fetch should not be called for existing editals');
    });

    test('Should escape HTML special characters in title, description and link', async () => {
        const testEdital = {
            nome: 'Chamada R&I <teste>',
            descrição: 'Apoio a P&D & <inovação>',
            link: 'https://example.com/edital?a=1&b=2',
            categoria: 'pesquisa',
            orgão_fomento: 'CNPq & FAPES',
            cronograma: [{ evento: 'Prazo <final>', data: '2026-12-01' }],
        };

        writeFileSync(join(dataDir, 'escape.json'), JSON.stringify(testEdital));

        let sentText = '';
        global.fetch = async (url, options) => {
            if (url.includes('createForumTopic')) {
                return {
                    ok: true,
                    json: async () => ({ ok: true, result: { message_thread_id: 123 } }),
                };
            }
            const body = JSON.parse(options.body);
            sentText = body.text;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile);

        assert.ok(sentText.includes('Chamada R&amp;I &lt;teste&gt;'));
        assert.ok(sentText.includes('Apoio a P&amp;D &amp; &lt;inovação&gt;'));
        assert.ok(sentText.includes('href="https://example.com/edital?a=1&amp;b=2"'));
        assert.ok(sentText.includes('CNPq &amp; FAPES'));
    });

    test('Should ignore editais with status encerrado and still record them in registry', async () => {
        writeFileSync(
            join(dataDir, 'encerrado.json'),
            JSON.stringify({
                nome: 'Edital Encerrado',
                status: 'encerrado',
                categoria: 'pesquisa',
                link: 'https://example.com/encerrado',
            })
        );

        let sendCalls = 0;
        global.fetch = async (url) => {
            if (url.includes('sendMessage')) sendCalls++;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { delayMs: 0 });

        assert.strictEqual(sendCalls, 0, 'Encerrado edital should never trigger Telegram message');
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['encerrado.json'], 'Encerrado edital should be recorded in registry');
    });

    test('Should send a single summary message when new editais exceed maxIndividual', async () => {
        for (let i = 1; i <= 5; i++) {
            writeFileSync(
                join(dataDir, `edital_${i}.json`),
                JSON.stringify({
                    nome: `Edital ${i}`,
                    status: 'aberto',
                    orgão_fomento: i <= 3 ? 'Horizon Europe' : 'FAPES',
                    categoria: 'pesquisa',
                    link: `https://example.com/${i}`,
                })
            );
        }

        const sentMessages = [];
        global.fetch = async (url, options) => {
            if (url.includes('sendMessage')) {
                sentMessages.push(JSON.parse(options.body).text);
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { maxIndividual: 3, delayMs: 0 });

        assert.strictEqual(sentMessages.length, 1, 'Should send exactly 1 summary message');
        assert.ok(sentMessages[0].includes('5 novos editais disponíveis'));
        assert.ok(sentMessages[0].includes('Horizon Europe'));
        assert.ok(sentMessages[0].includes('FAPES'));

        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.strictEqual(Object.keys(registry).length, 5, 'All 5 editais should be registered');
    });

    test('Should populate registry without sending any messages in seed mode', async () => {
        writeFileSync(
            join(dataDir, 'seed1.json'),
            JSON.stringify({ nome: 'Seed 1', status: 'aberto', categoria: 'pesquisa' })
        );
        writeFileSync(
            join(dataDir, 'seed2.json'),
            JSON.stringify({ nome: 'Seed 2', status: 'encerrado', categoria: 'bolsa' })
        );

        let fetchCalls = 0;
        global.fetch = async () => {
            fetchCalls++;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { seed: true, delayMs: 0 });

        assert.strictEqual(fetchCalls, 0, 'Seed mode must never call Telegram API');
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['seed1.json']);
        assert.ok(registry['seed2.json']);
    });
});
