import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    validateEditalObject,
    validateDataFile,
    validateDataDir,
} from '../../scripts/validate-data.js';

function makeValidEdital(overrides = {}) {
    return {
        nome: 'Edital de Pesquisa 2026',
        descrição: 'Apoio a projetos de pesquisa científica e tecnológica.',
        orgão_fomento: 'FAPES',
        categoria: 'Pesquisa',
        status: 'aberto',
        data_abertura: '2026-01-10',
        data_encerramento: '2026-12-20',
        link: 'https://fapes.es.gov.br/edital-2026',
        cronograma: [
            { evento: 'Abertura', data: '2026-01-10' },
            { evento: 'Encerramento', data: '2026-12-20' },
        ],
        tags: ['pesquisa', 'inovação'],
        ...overrides,
    };
}

describe('validate-data.js schema validation', () => {
    test('accepts a valid edital with all fields and with optional fields omitted', () => {
        assert.deepEqual(validateEditalObject(makeValidEdital(), 'ok.json'), []);

        const minimal = makeValidEdital();
        delete minimal.cronograma;
        delete minimal.tags;
        minimal.status = '';
        minimal.data_abertura = '';
        minimal.data_encerramento = '';

        assert.deepEqual(validateEditalObject(minimal, 'minimal.json'), []);
    });

    test('rejects non-object root values reporting file and $root field', () => {
        const errors = validateEditalObject(['not', 'an', 'object'], 'array.json');
        assert.equal(errors.length, 1);
        assert.equal(errors[0].file, 'array.json');
        assert.equal(errors[0].field, '$root');
    });

    test('rejects missing or non-string required fields reporting file and field', () => {
        const broken = makeValidEdital({
            nome: '   ',
            descrição: 42,
            orgão_fomento: undefined,
            categoria: null,
            data_abertura: 20260110,
            data_encerramento: false,
        });

        const errors = validateEditalObject(broken, 'broken.json');
        const fields = errors.map((e) => e.field);

        assert.ok(errors.every((e) => e.file === 'broken.json'));
        assert.ok(fields.includes('nome'));
        assert.ok(fields.includes('descrição'));
        assert.ok(fields.includes('orgão_fomento'));
        assert.ok(fields.includes('categoria'));
        assert.ok(fields.includes('data_abertura'));
        assert.ok(fields.includes('data_encerramento'));
    });

    test('rejects invalid link URLs and non-http(s) protocols', () => {
        for (const badLink of ['', 'nao-e-url', 'javascript:alert(1)', 'ftp://example.com/edital', 123]) {
            const errors = validateEditalObject(makeValidEdital({ link: badLink }), 'bad-link.json');
            assert.equal(errors.length, 1);
            assert.equal(errors[0].file, 'bad-link.json');
            assert.equal(errors[0].field, 'link');
        }
    });

    test('rejects unknown status values while allowing blank and valid aliases', () => {
        assert.deepEqual(validateEditalObject(makeValidEdital({ status: 'Abertas' }), 'alias.json'), []);
        assert.deepEqual(validateEditalObject(makeValidEdital({ status: '' }), 'blank.json'), []);

        const errors = validateEditalObject(makeValidEdital({ status: 'xyz' }), 'bad-status.json');
        assert.equal(errors.length, 1);
        assert.equal(errors[0].file, 'bad-status.json');
        assert.equal(errors[0].field, 'status');
    });

    test('rejects malformed cronograma and tags with exact field path', () => {
        const badTypes = validateEditalObject(
            makeValidEdital({ cronograma: 'invalid', tags: 'invalid' }),
            'bad-collections.json'
        );
        assert.deepEqual(
            badTypes.map((e) => e.field),
            ['cronograma', 'tags']
        );

        const badItems = validateEditalObject(
            makeValidEdital({
                cronograma: [
                    { evento: 'OK', data: '2026-01-10' },
                    { evento: 123, data: null },
                    'not-an-object',
                ],
                tags: ['valida', 99],
            }),
            'bad-items.json'
        );
        assert.deepEqual(
            badItems.map((e) => `${e.file}:${e.field}`),
            [
                'bad-items.json:cronograma[1].evento',
                'bad-items.json:cronograma[1].data',
                'bad-items.json:cronograma[2]',
                'bad-items.json:tags[1]',
            ]
        );
    });

    test('validateDataFile reports invalid JSON syntax with filename and $json field', () => {
        const dir = mkdtempSync(join(tmpdir(), 'validate-data-test-'));
        try {
            const badPath = join(dir, 'syntax-error.json');
            writeFileSync(badPath, '{ "nome": "quebrado"', 'utf-8');

            const errors = validateDataFile(badPath);
            assert.equal(errors.length, 1);
            assert.equal(errors[0].file, 'syntax-error.json');
            assert.equal(errors[0].field, '$json');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('validateDataDir aggregates errors across all JSON files in a directory', () => {
        const dir = mkdtempSync(join(tmpdir(), 'validate-dir-test-'));
        try {
            writeFileSync(join(dir, 'a-valid.json'), JSON.stringify(makeValidEdital()), 'utf-8');
            writeFileSync(
                join(dir, 'b-invalid.json'),
                JSON.stringify(makeValidEdital({ link: 'invalido', status: 'xyz' })),
                'utf-8'
            );
            writeFileSync(join(dir, 'ignore.txt'), 'not json', 'utf-8');

            const result = validateDataDir(dir);
            assert.equal(result.valid, false);
            assert.equal(result.checkedFiles, 2);
            assert.deepEqual(
                result.errors.map((e) => `${e.file}:${e.field}`),
                ['b-invalid.json:link', 'b-invalid.json:status']
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('all real JSON files in data/ pass full schema validation', () => {
        const result = validateDataDir('data');
        assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
        assert.ok(result.checkedFiles > 0);
    });

    test('accepts optional chamadas and proxima_etapa and rejects malformed ones', () => {
        const withNewFields = makeValidEdital({
            chamadas: [
                { nome: '1ª chamada', abertura: '2026-01-10', encerramento: '2026-03-10' },
                { nome: '2ª chamada', abertura: '2026-11-01', encerramento: '2026-12-15' },
            ],
            proxima_etapa: { evento: 'Encerramento da 2ª chamada', data: '2026-12-15' },
        });
        assert.deepEqual(validateEditalObject(withNewFields, 'new.json'), []);

        const withNullNextStep = makeValidEdital({ chamadas: [], proxima_etapa: null });
        assert.deepEqual(validateEditalObject(withNullNextStep, 'null-next.json'), []);

        const malformed = makeValidEdital({
            chamadas: [{ nome: 123, abertura: null, encerramento: '2026-12-15' }, 'invalido'],
            proxima_etapa: { evento: 42, data: null },
        });
        const errors = validateEditalObject(malformed, 'malformed-new.json');
        assert.deepEqual(
            errors.map((e) => `${e.file}:${e.field}`),
            [
                'malformed-new.json:chamadas[0].nome',
                'malformed-new.json:chamadas[0].abertura',
                'malformed-new.json:chamadas[1]',
                'malformed-new.json:proxima_etapa.evento',
                'malformed-new.json:proxima_etapa.data',
            ]
        );
    });
});

describe('daily-sync-deploy.yml workflow order and naming', () => {
    const workflow = readFileSync('.github/workflows/daily-sync-deploy.yml', 'utf-8');

    test('runs sync -> validate -> tests -> build -> pagefind -> commit data -> Telegram -> commit registry -> upload', () => {
        const markers = [
            'node scripts/sync-data.js',
            'node scripts/validate-data.js',
            'npm run test:scripts',
            'npm run build',
            'npx pagefind --site dist',
            'git add data/',
            'node scripts/notify-telegram.js',
            'node scripts/schedule-reminders.js',
            'git add registry/',
            'actions/upload-pages-artifact',
        ];

        let lastIndex = -1;
        for (const marker of markers) {
            const idx = workflow.indexOf(marker);
            assert.notEqual(idx, -1, `Expected workflow to contain "${marker}"`);
            assert.ok(
                idx > lastIndex,
                `Expected "${marker}" (index ${idx}) to appear after previous step (index ${lastIndex})`
            );
            lastIndex = idx;
        }
    });

    test('does not contain misleading step names like "Sync data from FAPES"', () => {
        assert.equal(workflow.includes('Sync data from FAPES'), false);
        assert.match(workflow, /- name: Validate data schema\s+run: node scripts\/validate-data\.js/);
    });
});

describe('repository hygiene, package name and workflow concurrency/actions v5', () => {
    test('package.json and package-lock.json use portal_edital as package name', () => {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
        const lock = JSON.parse(readFileSync('package-lock.json', 'utf-8'));

        assert.equal(pkg.name, 'portal_edital');
        assert.equal(lock.name, 'portal_edital');
        assert.equal(lock.packages[''].name, 'portal_edital');
    });

    test('deploy.yml and daily-sync-deploy.yml configure pages concurrency and Actions v5', () => {
        for (const workflowPath of [
            '.github/workflows/deploy.yml',
            '.github/workflows/daily-sync-deploy.yml',
        ]) {
            const content = readFileSync(workflowPath, 'utf-8');
            assert.match(
                content,
                /concurrency:\s*\n\s+group:\s*"?pages"?\s*\n\s+cancel-in-progress:\s*false/,
                `${workflowPath} should define concurrency group pages with cancel-in-progress: false`
            );
            assert.ok(content.includes('actions/checkout@v5'), `${workflowPath} should use actions/checkout@v5`);
            assert.ok(content.includes('actions/setup-node@v5'), `${workflowPath} should use actions/setup-node@v5`);
            assert.equal(content.includes('actions/checkout@v4'), false, `${workflowPath} should not use checkout@v4`);
            assert.equal(content.includes('actions/setup-node@v4'), false, `${workflowPath} should not use setup-node@v4`);
        }
    });
});
