import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    rmSync,
    existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syncData } from '../../scripts/sync-data.js';
import { run as runNotify } from '../../scripts/notify-telegram.js';
import { run as runReminders } from '../../scripts/schedule-reminders.js';

describe('sync-data.js Unit Tests', () => {
    let tempDir;
    let sourceDir;
    let targetDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'sync-data-test-'));
        sourceDir = join(tempDir, 'source');
        targetDir = join(tempDir, 'target');
        mkdirSync(sourceDir);
        mkdirSync(targetDir);
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test('espelha arquivo novo, atualizado e remove arquivo apagado na origem', () => {
        writeFileSync(join(targetDir, 'manter.json'), JSON.stringify({ nome: 'Versão antiga' }));
        writeFileSync(join(targetDir, 'apagado.json'), JSON.stringify({ nome: 'Deve sumir' }));

        writeFileSync(join(sourceDir, 'manter.json'), JSON.stringify({ nome: 'Versão nova' }));
        writeFileSync(join(sourceDir, 'novo.json'), JSON.stringify({ nome: 'Novo edital' }));

        const result = syncData({ sourceDir, targetDir });

        assert.deepStrictEqual(result.added, ['novo.json']);
        assert.deepStrictEqual(result.updated, ['manter.json']);
        assert.deepStrictEqual(result.removed, ['apagado.json']);
        assert.strictEqual(result.total, 2);

        const targetFiles = readdirSync(targetDir).sort();
        assert.deepStrictEqual(targetFiles, ['manter.json', 'novo.json']);
        assert.strictEqual(
            JSON.parse(readFileSync(join(targetDir, 'manter.json'), 'utf-8')).nome,
            'Versão nova'
        );
    });

    test('trata edital renomeado removendo o nome antigo e adicionando o novo', () => {
        writeFileSync(join(targetDir, 'edital_antigo.json'), JSON.stringify({ nome: 'Edital X' }));
        writeFileSync(join(sourceDir, 'edital_novo.json'), JSON.stringify({ nome: 'Edital X' }));

        const result = syncData({ sourceDir, targetDir });

        assert.deepStrictEqual(result.added, ['edital_novo.json']);
        assert.deepStrictEqual(result.removed, ['edital_antigo.json']);
        assert.strictEqual(existsSync(join(targetDir, 'edital_antigo.json')), false);
        assert.strictEqual(existsSync(join(targetDir, 'edital_novo.json')), true);
    });

    test('aborta sem alterar destino quando a origem não tem arquivos JSON', () => {
        writeFileSync(join(targetDir, 'existente.json'), JSON.stringify({ nome: 'Preservado' }));

        assert.throws(
            () => syncData({ sourceDir, targetDir }),
            /origem possui 0 arquivo\(s\) JSON/
        );

        assert.deepStrictEqual(readdirSync(targetDir), ['existente.json']);
    });

    test('aborta sem alterar destino quando o diretório de origem não existe', () => {
        writeFileSync(join(targetDir, 'existente.json'), JSON.stringify({ nome: 'Preservado' }));

        assert.throws(
            () => syncData({ sourceDir: join(tempDir, 'nao-existe'), targetDir }),
            /diretório de origem não encontrado/
        );

        assert.deepStrictEqual(readdirSync(targetDir), ['existente.json']);
    });

    test('preserva arquivos não-JSON no diretório de destino', () => {
        writeFileSync(join(targetDir, '.gitkeep'), '');
        writeFileSync(join(targetDir, 'antigo.json'), JSON.stringify({ nome: 'Antigo' }));
        writeFileSync(join(sourceDir, 'atual.json'), JSON.stringify({ nome: 'Atual' }));

        syncData({ sourceDir, targetDir });

        assert.deepStrictEqual(readdirSync(targetDir).sort(), ['.gitkeep', 'atual.json']);
    });

    test('entradas de editais removidos em downloads_registry.json não quebram scripts do Telegram', async () => {
        const registryDir = join(tempDir, 'registry');
        const registryFile = join(registryDir, 'downloads_registry.json');
        mkdirSync(registryDir);

        writeFileSync(join(targetDir, 'removido.json'), JSON.stringify({ nome: 'Removido' }));
        writeFileSync(
            join(targetDir, 'ativo.json'),
            JSON.stringify({
                nome: 'Ativo',
                categoria: 'pesquisa',
                link: 'https://example.com/ativo',
                cronograma: [{ evento: 'Abertura', data: '2099-01-01' }],
            })
        );
        writeFileSync(
            join(sourceDir, 'ativo.json'),
            JSON.stringify({
                nome: 'Ativo',
                categoria: 'pesquisa',
                link: 'https://example.com/ativo',
                cronograma: [{ evento: 'Abertura', data: '2099-01-01' }],
            })
        );

        writeFileSync(
            registryFile,
            JSON.stringify({
                'removido.json': { data_entrada: '2026-01-01T00:00:00.000Z', categoria: 'pesquisa' },
                'ativo.json': { data_entrada: '2026-01-01T00:00:00.000Z', categoria: 'pesquisa' },
            })
        );

        syncData({ sourceDir, targetDir });
        assert.strictEqual(existsSync(join(targetDir, 'removido.json')), false);

        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;

        await assert.doesNotReject(() => runNotify(targetDir, registryFile));
        await assert.doesNotReject(() => runReminders(targetDir, registryFile));
    });

    test('preserva edital movido de data/output/ para data/arquivo/ com o mesmo slug e trata reabertura', () => {
        const archiveDir = join(tempDir, 'archive');
        mkdirSync(archiveDir);

        writeFileSync(join(targetDir, 'edital_a.json'), JSON.stringify({ nome: 'Edital A', status: 'aberto' }));
        writeFileSync(join(sourceDir, 'edital_b.json'), JSON.stringify({ nome: 'Edital B', status: 'aberto' }));
        writeFileSync(
            join(archiveDir, 'edital_a.json'),
            JSON.stringify({ nome: 'Edital A', status: 'encerrado' })
        );

        const firstSync = syncData({ sourceDir, archiveDir, targetDir });
        assert.strictEqual(firstSync.total, 2);
        assert.strictEqual(firstSync.activeCount, 1);
        assert.strictEqual(firstSync.archivedCount, 1);
        assert.deepStrictEqual(firstSync.removed, []);
        assert.deepStrictEqual(readdirSync(targetDir).sort(), ['edital_a.json', 'edital_b.json']);
        assert.strictEqual(
            JSON.parse(readFileSync(join(targetDir, 'edital_a.json'), 'utf-8')).status,
            'encerrado'
        );

        // Reabertura: edital_a volta para sourceDir e sai de archiveDir
        rmSync(join(archiveDir, 'edital_a.json'));
        writeFileSync(
            join(sourceDir, 'edital_a.json'),
            JSON.stringify({ nome: 'Edital A', status: 'aberto' })
        );

        const reopenSync = syncData({ sourceDir, archiveDir, targetDir });
        assert.strictEqual(reopenSync.total, 2);
        assert.strictEqual(reopenSync.activeCount, 2);
        assert.strictEqual(reopenSync.archivedCount, 0);
        assert.deepStrictEqual(reopenSync.removed, []);
        assert.strictEqual(
            JSON.parse(readFileSync(join(targetDir, 'edital_a.json'), 'utf-8')).status,
            'aberto'
        );
    });

    test('dá precedência a data/output/ em caso de colisão com data/arquivo/ e tolera ausência de data/arquivo/', () => {
        const archiveDir = join(tempDir, 'archive');
        mkdirSync(archiveDir);

        writeFileSync(join(archiveDir, 'duplicado.json'), JSON.stringify({ nome: 'Versão arquivo' }));
        writeFileSync(join(sourceDir, 'duplicado.json'), JSON.stringify({ nome: 'Versão output' }));

        const result = syncData({ sourceDir, archiveDir, targetDir });
        assert.strictEqual(result.total, 1);
        assert.strictEqual(result.activeCount, 1);
        assert.strictEqual(result.archivedCount, 0);
        assert.strictEqual(
            JSON.parse(readFileSync(join(targetDir, 'duplicado.json'), 'utf-8')).nome,
            'Versão output'
        );

        // archiveDir inexistente não falha
        const noArchive = syncData({
            sourceDir,
            archiveDir: join(tempDir, 'arquivo-inexistente'),
            targetDir,
        });
        assert.strictEqual(noArchive.total, 1);
        assert.strictEqual(noArchive.archivedCount, 0);
    });

    test('editais arquivados sincronizados com status encerrado não disparam envio no Telegram', async () => {
        const archiveDir = join(tempDir, 'archive');
        const registryDir = join(tempDir, 'registry');
        const registryFile = join(registryDir, 'downloads_registry.json');
        mkdirSync(archiveDir);
        mkdirSync(registryDir);

        writeFileSync(
            join(sourceDir, 'ativo.json'),
            JSON.stringify({
                nome: 'Edital Ativo',
                categoria: 'pesquisa',
                status: 'aberto',
                link: 'https://example.com/ativo',
            })
        );
        writeFileSync(
            join(archiveDir, 'arquivado.json'),
            JSON.stringify({
                nome: 'Edital Arquivado 2024',
                categoria: 'pesquisa',
                status: 'encerrado',
                data_encerramento: '2024-06-01',
                link: 'https://example.com/arquivado',
            })
        );

        syncData({ sourceDir, archiveDir, targetDir });

        const sentMessages = [];
        const originalFetch = global.fetch;
        process.env.TELEGRAM_BOT_TOKEN = 'test-token';
        process.env.TELEGRAM_CHAT_ID = 'test-chat';
        global.fetch = async (url, init) => {
            const body = JSON.parse(init?.body || '{}');
            if (String(url).includes('sendMessage')) {
                sentMessages.push(body.text || '');
                return { ok: true, status: 200, json: async () => ({ ok: true }) };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, result: { message_thread_id: 123 } }),
            };
        };
        try {
            await runNotify(targetDir, registryFile);
        } finally {
            global.fetch = originalFetch;
            delete process.env.TELEGRAM_BOT_TOKEN;
            delete process.env.TELEGRAM_CHAT_ID;
        }

        assert.strictEqual(sentMessages.length, 1);
        assert.ok(sentMessages[0].includes('Edital Ativo'));
        assert.strictEqual(sentMessages[0].includes('Edital Arquivado 2024'), false);
    });
});
