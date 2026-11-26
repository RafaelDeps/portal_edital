export const DEFAULT_REPO_ISSUES_URL =
    'https://github.com/RafaelDeps/portal_edital/issues/new';

export const INDICAR_EDITAL_TEMPLATE = 'indicar-edital.yml';
export const INDICAR_EDITAL_LABEL = 'indicacao-edital';

export function isValidHttpUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return false;
    }
    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function validateIndicacao(input = {}) {
    const errors = {};
    const link = typeof input.link_oficial === 'string' ? input.link_oficial.trim() : '';
    const orgao = typeof input.orgao === 'string' ? input.orgao.trim() : '';

    if (!link) {
        errors.link_oficial = 'Informe o link oficial do edital.';
    } else if (!isValidHttpUrl(link)) {
        errors.link_oficial = 'Informe uma URL válida iniciando com http:// ou https://.';
    }

    if (!orgao) {
        errors.orgao = 'Informe o órgão de fomento ou instituição responsável.';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
    };
}

export function buildIndicarEditalUrl(input = {}, baseUrl = DEFAULT_REPO_ISSUES_URL) {
    const link = typeof input.link_oficial === 'string' ? input.link_oficial.trim() : '';
    const orgao = typeof input.orgao === 'string' ? input.orgao.trim() : '';
    const prazo = typeof input.prazo === 'string' ? input.prazo.trim() : '';
    const observacoes = typeof input.observacoes === 'string' ? input.observacoes.trim() : '';

    const params = new URLSearchParams();
    params.set('template', INDICAR_EDITAL_TEMPLATE);
    params.set('labels', INDICAR_EDITAL_LABEL);
    if (orgao) {
        params.set('title', `[Indicação] ${orgao}`);
    }
    if (link) {
        params.set('link_oficial', link);
    }
    if (orgao) {
        params.set('orgao', orgao);
    }
    if (prazo) {
        params.set('prazo', prazo);
    }
    if (observacoes) {
        params.set('observacoes', observacoes);
    }

    return `${baseUrl}?${params.toString()}`;
}
