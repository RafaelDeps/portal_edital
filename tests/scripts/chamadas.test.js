import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    analyzeChamadas,
    classifyChamada,
    formatDayMonth,
    formatLongDate,
    formatProximaEtapa,
    formatShortDate,
} from '../../src/utils/chamadas.js';

describe('chamadas.js — chamadas e próxima etapa', () => {
    const refDate = new Date(2026, 10, 25); // 2026-11-25

    test('cenário 1 chamada: destaca chamada única aberta até data de encerramento', () => {
        const result = analyzeChamadas(
            [{ nome: 'Chamada única', abertura: '2026-11-01', encerramento: '2026-12-20' }],
            refDate
        );

        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].status, 'aberta');
        assert.equal(result.activeChamada?.nome, 'Chamada única');
        assert.equal(result.highlightText, 'Chamada única aberta até 20/12');
    });

    test('cenário várias chamadas: identifica encerrada, destaca 2ª chamada aberta até 15/12 e marca 3ª como prevista', () => {
        const result = analyzeChamadas(
            [
                { nome: '1ª chamada', abertura: '2026-08-01', encerramento: '2026-09-30' },
                { nome: '2ª chamada', abertura: '2026-11-01', encerramento: '2026-12-15' },
                { nome: '3ª chamada', abertura: '2027-01-10', encerramento: '2027-02-20' },
            ],
            refDate
        );

        assert.deepEqual(
            result.items.map((c) => [c.nome, c.status]),
            [
                ['1ª chamada', 'encerrada'],
                ['2ª chamada', 'aberta'],
                ['3ª chamada', 'prevista'],
            ]
        );
        assert.equal(result.activeChamada?.nome, '2ª chamada');
        assert.equal(result.highlightText, '2ª chamada aberta até 15/12');
    });

    test('cenário JSON antigo: sem chamadas e sem proxima_etapa retorna estrutura vazia segura', () => {
        const result = analyzeChamadas(undefined, refDate);
        assert.deepEqual(result, {
            items: [],
            activeChamada: null,
            highlightText: null,
        });
        assert.equal(formatProximaEtapa(undefined), null);
        assert.equal(formatProximaEtapa(null), null);
    });

    test('não exibe destaque quando todas as chamadas estão encerradas ou futuras', () => {
        const allClosed = analyzeChamadas(
            [{ nome: '1ª chamada', abertura: '2026-01-01', encerramento: '2026-05-01' }],
            refDate
        );
        assert.equal(allClosed.activeChamada, null);
        assert.equal(allClosed.highlightText, null);

        const allFuture = analyzeChamadas(
            [{ nome: '1ª chamada', abertura: '2027-01-01', encerramento: '2027-02-01' }],
            refDate
        );
        assert.equal(allFuture.items[0].status, 'prevista');
        assert.equal(allFuture.activeChamada, null);
        assert.equal(allFuture.highlightText, null);
    });

    test('prioriza chamada aberta com encerramento mais próximo quando múltiplas estão abertas', () => {
        const result = analyzeChamadas(
            [
                { nome: 'Chamada B', abertura: '2026-11-01', encerramento: '2026-12-30' },
                { nome: 'Chamada A', abertura: '2026-11-01', encerramento: '2026-12-05' },
            ],
            refDate
        );
        assert.equal(result.activeChamada?.nome, 'Chamada A');
        assert.equal(result.highlightText, 'Chamada A aberta até 05/12');
    });

    test('classifica corretamente chamada sem abertura preenchida e formata datas locais sem erro de fuso horário', () => {
        assert.equal(
            classifyChamada({ nome: 'Fluxo contínuo', abertura: '', encerramento: '2026-12-15' }, refDate),
            'aberta'
        );
        assert.equal(formatDayMonth('2026-12-15'), '15/12');
        assert.equal(formatShortDate('2026-12-15'), '15/12/2026');
        assert.equal(formatLongDate('2026-12-15'), '15 de dezembro de 2026');
    });

    test('formata proxima_etapa quando presente', () => {
        const formatted = formatProximaEtapa({
            evento: 'Encerramento da 2ª chamada',
            data: '2026-12-15',
        });
        assert.deepEqual(formatted, {
            evento: 'Encerramento da 2ª chamada',
            data: '2026-12-15',
            dataFormatada: '15/12/2026',
        });
    });
});
