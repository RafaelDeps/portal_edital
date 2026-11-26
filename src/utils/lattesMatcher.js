export const TITULACAO_ORDER = Object.freeze({
    ensino_medio: 1,
    graduacao: 2,
    especializacao: 3,
    mestrado: 4,
    doutorado: 5,
});

export const TITULACAO_LABELS = Object.freeze({
    ensino_medio: 'Ensino Médio',
    graduacao: 'Graduação',
    especializacao: 'Especialização',
    mestrado: 'Mestrado',
    doutorado: 'Doutorado',
});

const STOPWORDS_PT = new Set([
    'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
    'entre', 'era', 'essa', 'esse', 'esta', 'este', 'foi', 'na', 'nas', 'no', 'nos',
    'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'que', 'se',
    'sem', 'ser', 'sob', 'sobre', 'sua', 'suas', 'seu', 'seus', 'um', 'uma', 'umas',
    'uns', 'edital', 'chamada', 'programa', 'projeto', 'projetos', 'apoio', 'fomento',
    'pesquisa', 'desenvolvimento', 'ciencia', 'tecnologia', 'brasil', 'estado', 'nacional',
]);

export function normalizeText(value) {
    if (typeof value !== 'string') return '';
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function tokenize(value) {
    const normalized = normalizeText(value);
    if (!normalized) return [];
    const tokens = normalized.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS_PT.has(t));
    return [...new Set(tokens)];
}

export function decodeXmlBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const asciiPreview = new TextDecoder('latin1').decode(bytes.subarray(0, 256));
    const encMatch = asciiPreview.match(/encoding\s*=\s*["']([^"']+)["']/i);
    const declared = encMatch ? encMatch[1].toLowerCase() : 'utf-8';

    if (declared.includes('iso-8859-1') || declared.includes('latin1') || declared.includes('1252')) {
        return new TextDecoder('iso-8859-1').decode(bytes);
    }
    return new TextDecoder('utf-8').decode(bytes);
}

function decodeXmlEntities(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function extractTagsRegex(xmlText, tagName) {
    const regex = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
    const results = [];
    let match;
    while ((match = regex.exec(xmlText)) !== null) {
        const attrStr = match[1] || '';
        const attrs = {};
        const attrRegex = /([A-Za-z0-9_-]+)\s*=\s*["']([^"']*)["']/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
            attrs[attrMatch[1].toUpperCase()] = decodeXmlEntities(attrMatch[2].trim());
        }
        results.push(attrs);
    }
    return results;
}

function extractElements(xmlText, tagName, doc) {
    if (doc) {
        const nodes = Array.from(doc.getElementsByTagName(tagName));
        return nodes.map((node) => {
            const attrs = {};
            for (const attr of Array.from(node.attributes || [])) {
                attrs[attr.name.toUpperCase()] = (attr.value || '').trim();
            }
            return attrs;
        });
    }
    return extractTagsRegex(xmlText, tagName);
}

function detectHighestTitulacao(xmlText, doc) {
    const checks = [
        ['POS-DOUTORADO', 'doutorado'],
        ['DOUTORADO', 'doutorado'],
        ['MESTRADO', 'mestrado'],
        ['MESTRADO-PROFISSIONALIZANTE', 'mestrado'],
        ['ESPECIALIZACAO', 'especializacao'],
        ['GRADUACAO', 'graduacao'],
        ['ENSINO-MEDIO-SEGUNDO-GRAU', 'ensino_medio'],
    ];

    let highest = '';
    let highestRank = 0;

    for (const [tag, key] of checks) {
        const found = extractElements(xmlText, tag, doc);
        if (found.length > 0 && TITULACAO_ORDER[key] > highestRank) {
            highest = key;
            highestRank = TITULACAO_ORDER[key];
        }
    }

    return highest;
}

/**
 * Extrai perfil acadêmico efêmero de um XML oficial do Currículo Lattes.
 * NÃO extrai nem retorna dados pessoais (nome, CPF, endereço, e-mail).
 */
export function parseLattesXml(xmlText) {
    if (typeof xmlText !== 'string' || !xmlText.trim()) {
        throw new Error('Arquivo XML vazio.');
    }

    let doc = null;
    if (typeof globalThis.DOMParser === 'function') {
        const parsed = new globalThis.DOMParser().parseFromString(xmlText, 'text/xml');
        const parseError = parsed.getElementsByTagName('parsererror');
        if (parseError && parseError.length > 0) {
            throw new Error('O arquivo enviado não é um XML válido.');
        }
        if (parsed.getElementsByTagName('CURRICULO-VITAE').length === 0) {
            throw new Error(
                'XML não reconhecido como Currículo Lattes (tag <CURRICULO-VITAE> ausente).'
            );
        }
        doc = parsed;
    } else {
        if (!/<CURRICULO-VITAE\b/i.test(xmlText)) {
            throw new Error(
                'XML não reconhecido como Currículo Lattes (tag <CURRICULO-VITAE> ausente).'
            );
        }
    }

    const titulacao = detectHighestTitulacao(xmlText, doc);

    const areasSet = new Set();
    for (const attrs of extractElements(xmlText, 'AREA-DE-ATUACAO', doc)) {
        for (const key of [
            'NOME-GRANDE-AREA-DO-CONHECIMENTO',
            'NOME-DA-AREA-DO-CONHECIMENTO',
            'NOME-DA-SUB-AREA-DO-CONHECIMENTO',
            'NOME-DA-ESPECIALIDADE',
        ]) {
            if (attrs[key]) {
                areasSet.add(attrs[key].replace(/_/g, ' ').trim());
            }
        }
    }

    const keywordsSet = new Set();
    for (const attrs of extractElements(xmlText, 'PALAVRAS-CHAVE', doc)) {
        for (let i = 1; i <= 6; i += 1) {
            const val = attrs[`PALAVRA-CHAVE-${i}`];
            if (val) keywordsSet.add(val);
        }
    }

    for (const attrs of extractElements(xmlText, 'PROJETO-DE-PESQUISA', doc)) {
        if (attrs['NOME-DO-PROJETO']) {
            keywordsSet.add(attrs['NOME-DO-PROJETO']);
        }
    }

    for (const attrs of extractElements(xmlText, 'LINHA-DE-PESQUISA', doc)) {
        if (attrs['TITULO-DA-LINHA-DE-PESQUISA']) {
            keywordsSet.add(attrs['TITULO-DA-LINHA-DE-PESQUISA']);
        }
    }

    return {
        source: 'lattes_xml',
        titulacao,
        publicoAlvo: '',
        areas: [...areasSet],
        palavrasChave: [...keywordsSet],
    };
}

export function buildManualProfile({ titulacao = '', publicoAlvo = '', termos = '' } = {}) {
    const cleanTitulacao = TITULACAO_ORDER[titulacao] ? titulacao : '';
    const cleanPublico = typeof publicoAlvo === 'string' ? normalizeText(publicoAlvo) : '';
    const rawItems =
        typeof termos === 'string'
            ? termos
                  .split(/[,;\n]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [];

    return {
        source: 'manual',
        titulacao: cleanTitulacao,
        publicoAlvo: cleanPublico,
        areas: rawItems,
        palavrasChave: rawItems,
    };
}

function normalizeTitulacaoKey(value) {
    const norm = normalizeText(value).replace(/\s+/g, '_');
    if (TITULACAO_ORDER[norm]) return norm;
    if (norm.includes('doutor')) return 'doutorado';
    if (norm.includes('mestr')) return 'mestrado';
    if (norm.includes('espec')) return 'especializacao';
    if (norm.includes('gradu')) return 'graduacao';
    if (norm.includes('medio')) return 'ensino_medio';
    return '';
}

export function rankEditais(profile, editais = []) {
    if (!profile || !Array.isArray(editais)) return [];

    const profileAreaPhrases = (profile.areas || []).map((a) => ({
        raw: a,
        norm: normalizeText(a),
    })).filter((a) => a.norm.length >= 3);

    const profileTokens = new Set([
        ...(profile.areas || []).flatMap(tokenize),
        ...(profile.palavrasChave || []).flatMap(tokenize),
    ]);

    const userRank = profile.titulacao ? TITULACAO_ORDER[profile.titulacao] || 0 : 0;
    const userPublico = normalizeText(profile.publicoAlvo || '');

    const results = [];

    for (const edital of editais) {
        if (edital.status !== 'aberto' && edital.status !== 'fechando') {
            continue;
        }

        const motivos = [];
        let points = 0;

        const titleNorm = normalizeText(edital.nome || '');
        const descNorm = normalizeText(edital.descrição || '');
        const catNorm = normalizeText(edital.categoriaLabel || edital.categoria || '');
        const tagsList = Array.isArray(edital.tags) ? edital.tags : [];
        const eleg = edital.elegibilidade && typeof edital.elegibilidade === 'object' ? edital.elegibilidade : null;
        const elegAreas = Array.isArray(eleg?.areas_conhecimento) ? eleg.areas_conhecimento : [];

        const editalCorpus = `${titleNorm} ${descNorm} ${catNorm} ${tagsList.map(normalizeText).join(' ')} ${elegAreas.map(normalizeText).join(' ')}`;
        const editalTokens = new Set(tokenize(editalCorpus));

        // 1. Direct area phrase matches (high signal)
        const matchedAreas = [];
        for (const area of profileAreaPhrases) {
            if (editalCorpus.includes(area.norm)) {
                matchedAreas.push(area.raw);
            }
        }
        if (matchedAreas.length > 0) {
            points += Math.min(45, matchedAreas.length * 22);
            motivos.push(`Área em comum: ${matchedAreas.slice(0, 3).join(', ')}`);
        }

        // 2. Token overlap against tags, title, description, category
        const matchedTokens = [];
        for (const tok of profileTokens) {
            if (editalTokens.has(tok)) {
                matchedTokens.push(tok);
            }
        }
        if (matchedTokens.length > 0) {
            points += Math.min(40, matchedTokens.length * 10);
            motivos.push(`Termos compatíveis: ${matchedTokens.slice(0, 5).join(', ')}`);
        }

        // 3. Structured eligibility evaluation (when present)
        let elegibilidadeStatus = 'nao_informada';
        if (eleg) {
            const reqTitulacao = normalizeTitulacaoKey(eleg.titulacao_minima || '');
            if (reqTitulacao && userRank > 0) {
                const reqRank = TITULACAO_ORDER[reqTitulacao];
                const label = TITULACAO_LABELS[reqTitulacao] || reqTitulacao;
                if (userRank >= reqRank) {
                    points += 20;
                    elegibilidadeStatus = 'compativel';
                    motivos.push(`Atende à titulação mínima (${label})`);
                } else {
                    points = Math.max(0, points - 25);
                    elegibilidadeStatus = 'atencao';
                    motivos.push(`Atenção: exige titulação mínima de ${label}`);
                }
            }

            const publicos = Array.isArray(eleg.publico_alvo)
                ? eleg.publico_alvo.map(normalizeText)
                : [];
            if (userPublico && publicos.length > 0) {
                if (publicos.some((p) => p.includes(userPublico) || userPublico.includes(p))) {
                    points += 15;
                    if (elegibilidadeStatus === 'nao_informada') {
                        elegibilidadeStatus = 'compativel';
                    }
                    motivos.push(`Público-alvo compatível (${profile.publicoAlvo})`);
                }
            }
        }

        const score = Math.min(100, Math.round(points));
        if (score <= 0) continue;

        const nivel = score >= 65 ? 'alta' : score >= 35 ? 'media' : 'inicial';

        results.push({
            edital,
            score,
            nivel,
            motivos,
            elegibilidadeStatus,
            requisitosResumo:
                typeof eleg?.requisitos_resumo === 'string' && eleg.requisitos_resumo.trim()
                    ? eleg.requisitos_resumo.trim()
                    : null,
        });
    }

    return results.sort((a, b) => b.score - a.score || a.edital.nome.localeCompare(b.edital.nome, 'pt-BR'));
}
