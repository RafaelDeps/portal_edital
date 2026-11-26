import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    mkdtempSync,
    writeFileSync,
    rmSync,
    existsSync,
    readFileSync,
    mkdirSync,
    renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../scripts/notify-telegram.js';
import { run as runReminders } from '../../scripts/schedule-reminders.js';

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

        global.fetch = async (url) => {
            if (url.includes('createForumTopic')) {
                return {
                    ok: true,
                    json: async () => ({ ok: true, result: { message_thread_id: 123 } }),
                };
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test('Should detect a new edital and update registry using stable link key', async () => {
        const testEdital = {
            nome: 'Edital Teste',
            descrição: 'Descrição de teste',
            link: 'https://test.com',
            categoria: 'bolsas',
            cronograma: [{ evento: 'Início', data: '2026-01-01' }],
        };

        writeFileSync(join(dataDir, 'test.json'), JSON.stringify(testEdital));

        await run(dataDir, registryFile, { delayMs: 0 });

        assert.ok(existsSync(registryFile), 'Registry file should be created');
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['https://test.com'], 'stable link key should be in registry');
        assert.strictEqual(registry['https://test.com'].categoria, 'bolsa');
        assert.strictEqual(registry['https://test.com'].anunciado, true);
    });

    test('Should skip already registered editais and migrate legacy filename key', async () => {
        const initialRegistry = {
            'existing.json': {
                data_entrada: '2026-01-01T00:00:00.000Z',
                notificacoes_enviadas: ['ev_2026-01-01'],
            },
        };
        writeFileSync(registryFile, JSON.stringify(initialRegistry));

        writeFileSync(
            join(dataDir, 'existing.json'),
            JSON.stringify({ nome: 'Existing', link: 'https://example.com/existing' })
        );

        let fetchCalled = false;
        global.fetch = async () => {
            fetchCalled = true;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { delayMs: 0 });

        assert.strictEqual(fetchCalled, false, 'Fetch should not be called for existing editals');
        const migrated = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.strictEqual(migrated['existing.json'], undefined);
        assert.ok(migrated['https://example.com/existing']);
        assert.deepStrictEqual(migrated['https://example.com/existing'].notificacoes_enviadas, [
            'ev_2026-01-01',
        ]);
    });

    test('Should not re-announce when an already announced edital file is renamed', async () => {
        const edital = {
            nome: 'Edital Renomeado',
            link: 'https://example.com/estavel',
            categoria: 'pesquisa',
        };
        writeFileSync(join(dataDir, 'nome_original.json'), JSON.stringify(edital));

        let sendCalls = 0;
        global.fetch = async (url) => {
            if (url.includes('sendMessage')) sendCalls++;
            if (url.includes('createForumTopic')) {
                return { ok: true, json: async () => ({ ok: true, result: { message_thread_id: 123 } }) };
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { delayMs: 0 });
        assert.strictEqual(sendCalls, 1);

        renameSync(join(dataDir, 'nome_original.json'), join(dataDir, 'nome_alterado.json'));
        await run(dataDir, registryFile, { delayMs: 0 });
        assert.strictEqual(sendCalls, 1, 'Renaming file must not trigger a second announcement');
    });

    test('Should still announce edital if initial announcement failed and schedule-reminders ran in between', async () => {
        const today = '2026-11-25';
        writeFileSync(
            join(dataDir, 'pendente.json'),
            JSON.stringify({
                nome: 'Edital Pendente',
                link: 'https://example.com/pendente',
                categoria: 'pesquisa',
                cronograma: [{ evento: 'Abertura', data: today }],
            })
        );

        global.fetch = async () => ({
            ok: false,
            json: async () => ({ ok: false, error_code: 400, description: 'Bad Request' }),
        });
        await run(dataDir, registryFile, { delayMs: 0 });

        let reminderSent = 0;
        global.fetch = async (url) => {
            if (url.includes('sendMessage')) reminderSent++;
            if (url.includes('createForumTopic')) {
                return { ok: true, json: async () => ({ ok: true, result: { message_thread_id: 123 } }) };
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };
        await runReminders(dataDir, registryFile, { today, delayMs: 0 });
        assert.strictEqual(reminderSent, 1);

        const regAfterReminder = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.strictEqual(regAfterReminder['https://example.com/pendente'].anunciado, false);

        let announced = 0;
        global.fetch = async (url) => {
            if (url.includes('sendMessage')) announced++;
            if (url.includes('createForumTopic')) {
                return { ok: true, json: async () => ({ ok: true, result: { message_thread_id: 123 } }) };
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };
        await run(dataDir, registryFile, { delayMs: 0 });
        assert.strictEqual(announced, 1, 'Edital should still be announced after reminder ran');

        const regFinal = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.strictEqual(regFinal['https://example.com/pendente'].anunciado, true);
        assert.ok(
            regFinal['https://example.com/pendente'].notificacoes_enviadas.includes(
                `Abertura_${today}`
            )
        );
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
            sentText = JSON.parse(options.body).text;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { delayMs: 0 });

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

        assert.strictEqual(sendCalls, 0);
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['https://example.com/encerrado']);
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

        assert.strictEqual(sentMessages.length, 1);
        assert.ok(sentMessages[0].includes('5 novos editais disponíveis'));
        assert.ok(sentMessages[0].includes('Horizon Europe'));
        assert.ok(sentMessages[0].includes('FAPES'));

        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.strictEqual(Object.keys(registry).length, 5);
    });

    test('Should populate registry without sending any messages in seed mode', async () => {
        writeFileSync(
            join(dataDir, 'seed1.json'),
            JSON.stringify({ nome: 'Seed 1', status: 'aberto', categoria: 'pesquisa', link: 'https://example.com/s1' })
        );
        writeFileSync(
            join(dataDir, 'seed2.json'),
            JSON.stringify({ nome: 'Seed 2', status: 'encerrado', categoria: 'bolsa', link: 'https://example.com/s2' })
        );

        let fetchCalls = 0;
        global.fetch = async () => {
            fetchCalls++;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { seed: true, delayMs: 0 });

        assert.strictEqual(fetchCalls, 0);
        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(registry['https://example.com/s1']);
        assert.ok(registry['https://example.com/s2']);
    });
});
