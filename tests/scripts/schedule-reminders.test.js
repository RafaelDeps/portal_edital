import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../scripts/schedule-reminders.js';

describe('schedule-reminders.js Unit Tests', () => {
    let tempDir;
    let dataDir;
    let registryFile;

    beforeEach(() => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = 'mock-chat-id';

        tempDir = mkdtempSync(join(tmpdir(), 'reminder-test-'));
        dataDir = join(tempDir, 'data');
        const registryDir = join(tempDir, 'registry');
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

    test('Should trigger reminder for today event', async () => {
        const today = '2026-11-25';
        const testEdital = {
            nome: 'Edital Hoje',
            link: 'https://example.com/hoje',
            cronograma: [{ evento: 'Evento de Hoje', data: today }],
        };

        writeFileSync(join(dataDir, 'hoje.json'), JSON.stringify(testEdital));

        let fetchMessage = '';
        global.fetch = async (url, options) => {
            if (url.includes('createForumTopic')) {
                return { ok: true, json: async () => ({ ok: true, result: { message_thread_id: 123 } }) };
            }
            fetchMessage = JSON.parse(options.body).text;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { today, delayMs: 0 });

        assert.ok(fetchMessage.includes('Lembrete de Cronograma'));
        assert.ok(fetchMessage.includes('Evento de Hoje'));

        const registry = JSON.parse(readFileSync(registryFile, 'utf-8'));
        assert.ok(
            registry['https://example.com/hoje'].notificacoes_enviadas.includes(`Evento de Hoje_${today}`)
        );
        assert.strictEqual(registry._meta.last_reminders_run, today);
    });

    test('Should not double notify for the same event', async () => {
        const today = '2026-11-25';
        const eventKey = `Evento Repetido_${today}`;

        writeFileSync(
            registryFile,
            JSON.stringify({
                'https://example.com/repetido': {
                    anunciado: true,
                    notificacoes_enviadas: [eventKey],
                },
            })
        );

        writeFileSync(
            join(dataDir, 'repetido.json'),
            JSON.stringify({
                nome: 'Edital Repetido',
                link: 'https://example.com/repetido',
                cronograma: [{ evento: 'Evento Repetido', data: today }],
            })
        );

        let fetchCalls = 0;
        global.fetch = async (url) => {
            if (url.includes('sendMessage')) fetchCalls++;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { today, delayMs: 0 });
        assert.strictEqual(fetchCalls, 0);
    });

    test('Should escape HTML special characters in reminder payload', async () => {
        const today = '2026-11-25';
        writeFileSync(
            join(dataDir, 'escape_reminder.json'),
            JSON.stringify({
                nome: 'Edital R&I <teste>',
                link: 'https://example.com/doc?a=1&b=2',
                cronograma: [{ evento: 'Submissão <final> & revisão', data: today }],
            })
        );

        let sentText = '';
        global.fetch = async (url, options) => {
            if (url.includes('createForumTopic')) {
                return { ok: true, json: async () => ({ ok: true, result: { message_thread_id: 123 } }) };
            }
            sentText = JSON.parse(options.body).text;
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { today, delayMs: 0 });

        assert.ok(sentText.includes('Edital R&amp;I &lt;teste&gt;'));
        assert.ok(sentText.includes('Submissão &lt;final&gt; &amp; revisão'));
        assert.ok(sentText.includes('href="https://example.com/doc?a=1&amp;b=2"'));
    });

    test('Should recover missed reminders when job did not run for 2 days without duplicating', async () => {
        writeFileSync(
            registryFile,
            JSON.stringify({
                _meta: { last_reminders_run: '2026-11-22' },
            })
        );

        writeFileSync(
            join(dataDir, 'recuperacao.json'),
            JSON.stringify({
                nome: 'Edital Recuperação',
                link: 'https://example.com/rec',
                cronograma: [
                    { evento: 'Evento Dia 23', data: '2026-11-23' },
                    { evento: 'Evento Dia 24', data: '2026-11-24' },
                    { evento: 'Evento Dia 25', data: '2026-11-25' },
                    { evento: 'Evento Futuro', data: '2026-11-26' },
                ],
            })
        );

        const sent = [];
        global.fetch = async (url, options) => {
            if (url.includes('sendMessage')) {
                sent.push(JSON.parse(options.body).text);
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { today: '2026-11-25', delayMs: 0 });
        assert.strictEqual(sent.length, 3);
        assert.ok(sent[0].includes('Evento Dia 23'));
        assert.ok(sent[1].includes('Evento Dia 24'));
        assert.ok(sent[2].includes('Evento Dia 25'));

        await run(dataDir, registryFile, { today: '2026-11-25', delayMs: 0 });
        assert.strictEqual(sent.length, 3, 'Must not resend recovered reminders');
    });

    test('Should ignore invalid item.data without breaking other events in the same edital', async () => {
        const today = '2026-11-25';
        writeFileSync(
            join(dataDir, 'data_invalida.json'),
            JSON.stringify({
                nome: 'Edital Com Evento Inválido',
                link: 'https://example.com/invalido',
                cronograma: [
                    { evento: 'Evento Quebrado', data: null },
                    { evento: 'Evento Número', data: 12345 },
                    { evento: 'Evento Válido', data: `A partir de ${today}` },
                ],
            })
        );

        const sent = [];
        global.fetch = async (url, options) => {
            if (url.includes('sendMessage')) {
                sent.push(JSON.parse(options.body).text);
            }
            return { ok: true, json: async () => ({ ok: true }) };
        };

        await run(dataDir, registryFile, { today, delayMs: 0 });
        assert.strictEqual(sent.length, 1);
        assert.ok(sent[0].includes('Evento Válido'));
    });
});
