export const STATUS_VALUES = [
    'aberto',
    'fechando',
    'encerrado',
    'suspenso',
    'resultado',
    'indefinido',
];

export const FECHANDO_DAYS_THRESHOLD = 7;

const STATUS_ALIASES = new Map([
    ['aberto', 'aberto'],
    ['aberta', 'aberto'],
    ['abertos', 'aberto'],
    ['abertas', 'aberto'],
    ['fechando', 'fechando'],
    ['encerrado', 'encerrado'],
    ['encerrada', 'encerrado'],
    ['fechado', 'encerrado'],
    ['fechada', 'encerrado'],
    ['suspenso', 'suspenso'],
    ['suspensa', 'suspenso'],
    ['resultado', 'resultado'],
    ['resultados', 'resultado'],
    ['indefinido', 'indefinido'],
    ['indefinida', 'indefinido'],
]);

function normalizeText(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

export function normalizeStatus(value) {
    if (typeof value !== 'string') {
        return 'indefinido';
    }

    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
        return 'indefinido';
    }

    return STATUS_ALIASES.get(normalizedValue) ?? 'indefinido';
}

function parseLocalDate(dateStr) {
    if (typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]) - 1;
        const day = Number(isoMatch[3]);
        const date = new Date(year, month, day);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

/**
 * Calcula o status efetivo de um edital com base no status declarado e na data_encerramento:
 * - suspenso / resultado / encerrado são mantidos;
 * - data_encerramento < hoje => 'encerrado' (mesmo se o JSON disser 'aberto' ou vazio);
 * - data_encerramento nos próximos N dias (0..FECHANDO_DAYS_THRESHOLD) => 'fechando';
 * - data_encerramento futura (> N dias) => 'aberto';
 * - sem data_encerramento e status vazio/desconhecido => 'indefinido' (nunca 'aberto' automático).
 */
export function getEffectiveStatus(
    data,
    referenceDate = new Date(),
    fechandoDays = FECHANDO_DAYS_THRESHOLD
) {
    const baseStatus = normalizeStatus(data?.status);

    if (baseStatus === 'encerrado' || baseStatus === 'suspenso' || baseStatus === 'resultado') {
        return baseStatus;
    }

    const endDate = parseLocalDate(data?.data_encerramento);
    if (!endDate) {
        return baseStatus;
    }

    const today = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
    );

    const diffMs = endDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return 'encerrado';
    }
    if (diffDays <= fechandoDays) {
        return 'fechando';
    }
    return 'aberto';
}
