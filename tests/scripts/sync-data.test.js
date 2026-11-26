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
});
