import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidStatusInput, normalizeStatus, getEffectiveStatus } from '../../src/utils/status.js';

describe('status normalization', () => {
    test('validates known status inputs and rejects unknown values', () => {
        assert.equal(isValidStatusInput(''), true);
        assert.equal(isValidStatusInput('   '), true);
        assert.equal(isValidStatusInput('aberto'), true);
        assert.equal(isValidStatusInput('Abertas'), true);
        assert.equal(isValidStatusInput('fechado'), true);
        assert.equal(isValidStatusInput('suspensa'), true);
        assert.equal(isValidStatusInput('resultado'), true);
        assert.equal(isValidStatusInput('indefinido'), true);
        assert.equal(isValidStatusInput('xyz'), false);
        assert.equal(isValidStatusInput('em andamento'), false);
        assert.equal(isValidStatusInput(null), false);
        assert.equal(isValidStatusInput(123), false);
    });

    test('does not fall back to aberto when status is blank or unknown', () => {
        assert.equal(normalizeStatus(''), 'indefinido');
        assert.equal(normalizeStatus(null), 'indefinido');
        assert.equal(normalizeStatus('desconhecido'), 'indefinido');
    });

    test('normalizes aliases to supported values', () => {
        assert.equal(normalizeStatus('abertas'), 'aberto');
        assert.equal(normalizeStatus('fechado'), 'encerrado');
        assert.equal(normalizeStatus('suspensa'), 'suspenso');
    });

    test('marks expired edital as encerrado even if JSON says aberto', () => {
        const refDate = new Date(2026, 10, 25); // 2026-11-25
        assert.equal(
            getEffectiveStatus({ status: 'aberto', data_encerramento: '2026-11-24' }, refDate),
            'encerrado'
        );
    });

    test('marks edital closing within 7 days as fechando and >7 days as aberto', () => {
        const refDate = new Date(2026, 10, 25); // 2026-11-25
        assert.equal(
            getEffectiveStatus({ status: 'aberto', data_encerramento: '2026-11-25' }, refDate),
            'fechando'
        );
        assert.equal(
            getEffectiveStatus({ status: 'aberto', data_encerramento: '2026-12-02' }, refDate),
            'fechando'
        );
        assert.equal(
            getEffectiveStatus({ status: 'aberto', data_encerramento: '2026-12-03' }, refDate),
            'aberto'
        );
    });

    test('decides blank status by deadline or keeps indefinido when no deadline exists', () => {
        const refDate = new Date(2026, 10, 25);
        assert.equal(getEffectiveStatus({ status: '', data_encerramento: '' }, refDate), 'indefinido');
        assert.equal(
            getEffectiveStatus({ status: '', data_encerramento: '2026-01-10' }, refDate),
            'encerrado'
        );
        assert.equal(
            getEffectiveStatus({ status: '', data_encerramento: '2026-12-20' }, refDate),
            'aberto'
        );
    });
});
