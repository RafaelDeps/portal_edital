import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
    DEFAULT_REPO_ISSUES_URL,
    INDICAR_EDITAL_LABEL,
    INDICAR_EDITAL_TEMPLATE,
    validateIndicacao,
    buildIndicarEditalUrl,
} from '../../src/utils/indicarEdital.js';

describe('indicarEdital.js helper', () => {
    test('rejects missing or invalid link_oficial and missing orgao', () => {
        const empty = validateIndicacao({});
        assert.equal(empty.valid, false);
        assert.ok(empty.errors.link_oficial);
        assert.ok(empty.errors.orgao);

        const badProtocol = validateIndicacao({
            link_oficial: 'javascript:alert(1)',
            orgao: 'FAPES',
        });
        assert.equal(badProtocol.valid, false);
        assert.ok(badProtocol.errors.link_oficial);
        assert.equal(badProtocol.errors.orgao, undefined);

        const noProtocol = validateIndicacao({
            link_oficial: 'fapes.es.gov.br/edital',
            orgao: 'FAPES',
        });
        assert.equal(noProtocol.valid, false);
        assert.ok(noProtocol.errors.link_oficial);
    });

    test('accepts valid link_oficial and orgao', () => {
        const result = validateIndicacao({
            link_oficial: 'https://fapes.es.gov.br/edital-2026',
            orgao: 'FAPES',
        });
        assert.equal(result.valid, true);
        assert.deepEqual(result.errors, {});
    });

    test('builds pre-filled GitHub Issue URL with encoded params and omits blank optionals', () => {
        const fullUrl = buildIndicarEditalUrl({
            link_oficial: 'https://fapes.es.gov.br/edital?id=10&ano=2026',
            orgao: 'FAPES / ES',
            prazo: '15/12/2026',
            observacoes: 'Área: pesquisa & inovação',
        });

        const parsed = new URL(fullUrl);
        assert.equal(`${parsed.origin}${parsed.pathname}`, DEFAULT_REPO_ISSUES_URL);
        assert.equal(parsed.searchParams.get('template'), INDICAR_EDITAL_TEMPLATE);
        assert.equal(parsed.searchParams.get('labels'), INDICAR_EDITAL_LABEL);
        assert.equal(parsed.searchParams.get('title'), '[Indicação] FAPES / ES');
        assert.equal(
            parsed.searchParams.get('link_oficial'),
            'https://fapes.es.gov.br/edital?id=10&ano=2026'
        );
        assert.equal(parsed.searchParams.get('orgao'), 'FAPES / ES');
        assert.equal(parsed.searchParams.get('prazo'), '15/12/2026');
        assert.equal(parsed.searchParams.get('observacoes'), 'Área: pesquisa & inovação');

        const body = parsed.searchParams.get('body') || '';
        assert.ok(body.includes('https://fapes.es.gov.br/edital?id=10&ano=2026'));
        assert.ok(body.includes('FAPES / ES'));
        assert.ok(body.includes('15/12/2026'));
        assert.ok(body.includes('Área: pesquisa & inovação'));

        const minimalUrl = buildIndicarEditalUrl({
            link_oficial: 'https://cnpq.br/chamada-1',
            orgao: 'CNPq',
            prazo: '   ',
            observacoes: '',
        });
        const parsedMinimal = new URL(minimalUrl);
        assert.equal(parsedMinimal.searchParams.has('prazo'), false);
        assert.equal(parsedMinimal.searchParams.has('observacoes'), false);
        const minimalBody = parsedMinimal.searchParams.get('body') || '';
        assert.ok(minimalBody.includes('https://cnpq.br/chamada-1'));
        assert.ok(minimalBody.includes('CNPq'));
        assert.equal(minimalBody.includes('Prazo'), false);
        assert.equal(minimalBody.includes('Observações'), false);
    });
});

describe('.github/ISSUE_TEMPLATE/indicar-edital.yml', () => {
    const yaml = readFileSync('.github/ISSUE_TEMPLATE/indicar-edital.yml', 'utf-8');

    test('defines required fields, optional fields, indicacao-edital label and LGPD notice', () => {
        assert.match(yaml, /labels:\s*\["indicacao-edital"\]/);
        assert.match(yaml, /id:\s*link_oficial[\s\S]*?required:\s*true/);
        assert.match(yaml, /id:\s*orgao[\s\S]*?required:\s*true/);
        assert.match(yaml, /id:\s*prazo[\s\S]*?required:\s*false/);
        assert.match(yaml, /id:\s*observacoes[\s\S]*?required:\s*false/);
        assert.match(yaml, /LGPD/i);
        assert.equal(/id:\s*(email|e-mail|telefone|cpf|nome_completo)/i.test(yaml), false);
    });
});
