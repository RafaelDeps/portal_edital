const MONTHS_PT = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
];

export function parseLocalDate(dateStr) {
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

function toLocalMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDayMonth(dateStr) {
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return typeof dateStr === 'string' ? dateStr.trim() : '';
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

export function formatShortDate(dateStr) {
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return typeof dateStr === 'string' ? dateStr.trim() : '';
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${parsed.getFullYear()}`;
}

export function formatLongDate(dateStr) {
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return typeof dateStr === 'string' ? dateStr.trim() : '';
    const day = String(parsed.getDate()).padStart(2, '0');
    const monthName = MONTHS_PT[parsed.getMonth()];
    return `${day} de ${monthName} de ${parsed.getFullYear()}`;
}

export function classifyChamada(chamada, referenceDate = new Date()) {
    const today = toLocalMidnight(referenceDate);
    const start = parseLocalDate(chamada?.abertura);
    const end = parseLocalDate(chamada?.encerramento);

    if (end && end.getTime() < today.getTime()) {
        return 'encerrada';
    }
    if (start && start.getTime() > today.getTime()) {
        return 'prevista';
    }
    return 'aberta';
}

export function analyzeChamadas(chamadas = [], referenceDate = new Date()) {
    if (!Array.isArray(chamadas) || chamadas.length === 0) {
        return {
            items: [],
            activeChamada: null,
            highlightText: null,
        };
    }

    const items = chamadas.map((chamada) => {
        const status = classifyChamada(chamada, referenceDate);
        const endDate = parseLocalDate(chamada.encerramento);
        return {
            ...chamada,
            status,
            aberturaFormatada: formatShortDate(chamada.abertura),
            encerramentoFormatado: formatShortDate(chamada.encerramento),
            encerramentoDiaMes: formatDayMonth(chamada.encerramento),
            _endTimestamp: endDate ? endDate.getTime() : Number.POSITIVE_INFINITY,
        };
    });

    const openItems = items
        .filter((item) => item.status === 'aberta')
        .sort((a, b) => a._endTimestamp - b._endTimestamp);

    const activeChamada = openItems[0] ?? null;
    let highlightText = null;
    if (activeChamada) {
        highlightText = activeChamada.encerramentoDiaMes
            ? `${activeChamada.nome} aberta até ${activeChamada.encerramentoDiaMes}`
            : `${activeChamada.nome} aberta`;
    }

    return {
        items: items.map(({ _endTimestamp, ...rest }) => rest),
        activeChamada: activeChamada
            ? (({ _endTimestamp, ...rest }) => rest)(activeChamada)
            : null,
        highlightText,
    };
}

export function formatProximaEtapa(proximaEtapa) {
    if (!proximaEtapa || typeof proximaEtapa !== 'object') {
        return null;
    }
    const evento = typeof proximaEtapa.evento === 'string' ? proximaEtapa.evento.trim() : '';
    const data = typeof proximaEtapa.data === 'string' ? proximaEtapa.data.trim() : '';
    if (!evento && !data) {
        return null;
    }
    return {
        evento,
        data,
        dataFormatada: data ? formatShortDate(data) : '',
    };
}
