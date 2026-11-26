import { readFileSync, readdirSync } from 'fs';
import { basename, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isValidStatusInput } from '../src/utils/status.js';

const REQUIRED_NON_EMPTY_STRING_FIELDS = ['nome'];
const REQUIRED_STRING_FIELDS = [
    'descrição',
    'orgão_fomento',
    'categoria',
    'data_abertura',
    'data_encerramento',
];

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidHttpUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function validateEditalObject(data, fileName = '<memory>') {
    const errors = [];
    const addError = (field, message) => {
        errors.push({ file: fileName, field, message });
    };

    if (!isPlainObject(data)) {
        addError('$root', 'O conteúdo do arquivo deve ser um objeto JSON.');
        return errors;
    }

    for (const field of REQUIRED_NON_EMPTY_STRING_FIELDS) {
        if (typeof data[field] !== 'string' || data[field].trim() === '') {
            addError(field, 'Campo obrigatório deve ser uma string não vazia.');
        }
    }

    for (const field of REQUIRED_STRING_FIELDS) {
        if (typeof data[field] !== 'string') {
            addError(field, 'Campo obrigatório deve ser uma string.');
        }
    }

    if (!isValidHttpUrl(data.link)) {
        addError('link', 'Campo obrigatório deve ser uma URL válida com protocolo http:// ou https://.');
    }

    if (!isValidStatusInput(data.status)) {
        addError(
            'status',
            `Status inválido (${JSON.stringify(data.status)}). Use string vazia ou um status reconhecido pelo portal.`
        );
    }

    if (data.cronograma !== undefined) {
        if (!Array.isArray(data.cronograma)) {
            addError('cronograma', 'Campo opcional cronograma deve ser um array.');
        } else {
            data.cronograma.forEach((item, index) => {
                if (!isPlainObject(item)) {
                    addError(`cronograma[${index}]`, 'Cada item do cronograma deve ser um objeto.');
                    return;
                }
                if (typeof item.evento !== 'string') {
                    addError(`cronograma[${index}].evento`, 'Campo evento do cronograma deve ser uma string.');
                }
                if (typeof item.data !== 'string') {
                    addError(`cronograma[${index}].data`, 'Campo data do cronograma deve ser uma string.');
                }
            });
        }
    }

    if (data.tags !== undefined) {
        if (!Array.isArray(data.tags)) {
            addError('tags', 'Campo opcional tags deve ser um array de strings.');
        } else {
            data.tags.forEach((tag, index) => {
                if (typeof tag !== 'string') {
                    addError(`tags[${index}]`, 'Cada item em tags deve ser uma string.');
                }
            });
        }
    }

    if (data.chamadas !== undefined) {
        if (!Array.isArray(data.chamadas)) {
            addError('chamadas', 'Campo opcional chamadas deve ser um array.');
        } else {
            data.chamadas.forEach((item, index) => {
                if (!isPlainObject(item)) {
                    addError(`chamadas[${index}]`, 'Cada item de chamadas deve ser um objeto.');
                    return;
                }
                if (typeof item.nome !== 'string') {
                    addError(`chamadas[${index}].nome`, 'Campo nome da chamada deve ser uma string.');
                }
                if (typeof item.abertura !== 'string') {
                    addError(`chamadas[${index}].abertura`, 'Campo abertura da chamada deve ser uma string.');
                }
                if (typeof item.encerramento !== 'string') {
                    addError(
                        `chamadas[${index}].encerramento`,
                        'Campo encerramento da chamada deve ser uma string.'
                    );
                }
            });
        }
    }

    if (data.proxima_etapa !== undefined && data.proxima_etapa !== null) {
        if (!isPlainObject(data.proxima_etapa)) {
            addError('proxima_etapa', 'Campo opcional proxima_etapa deve ser um objeto ou null.');
        } else {
            if (typeof data.proxima_etapa.evento !== 'string') {
                addError('proxima_etapa.evento', 'Campo evento de proxima_etapa deve ser uma string.');
            }
            if (typeof data.proxima_etapa.data !== 'string') {
                addError('proxima_etapa.data', 'Campo data de proxima_etapa deve ser uma string.');
            }
        }
    }

    if (data.elegibilidade !== undefined && data.elegibilidade !== null) {
        if (!isPlainObject(data.elegibilidade)) {
            addError('elegibilidade', 'Campo opcional elegibilidade deve ser um objeto ou null.');
        } else {
            const eleg = data.elegibilidade;
            if (eleg.titulacao_minima !== undefined && typeof eleg.titulacao_minima !== 'string') {
                addError('elegibilidade.titulacao_minima', 'Campo titulacao_minima deve ser uma string.');
            }
            if (eleg.requisitos_resumo !== undefined && typeof eleg.requisitos_resumo !== 'string') {
                addError('elegibilidade.requisitos_resumo', 'Campo requisitos_resumo deve ser uma string.');
            }
            for (const arrayField of ['publico_alvo', 'areas_conhecimento']) {
                if (eleg[arrayField] !== undefined) {
                    if (!Array.isArray(eleg[arrayField])) {
                        addError(`elegibilidade.${arrayField}`, `Campo ${arrayField} deve ser um array de strings.`);
                    } else {
                        eleg[arrayField].forEach((val, idx) => {
                            if (typeof val !== 'string') {
                                addError(
                                    `elegibilidade.${arrayField}[${idx}]`,
                                    `Cada item de ${arrayField} deve ser uma string.`
                                );
                            }
                        });
                    }
                }
            }
        }
    }

    return errors;
}

export function validateDataFile(filePath, fileName = basename(filePath)) {
    let parsed;
    try {
        const content = readFileSync(filePath, 'utf-8');
        parsed = JSON.parse(content);
    } catch (err) {
        return [{ file: fileName, field: '$json', message: `JSON inválido: ${err.message}` }];
    }

    return validateEditalObject(parsed, fileName);
}

export function validateDataDir(dataDir = 'data') {
    const files = readdirSync(dataDir)
        .filter((file) => file.endsWith('.json'))
        .sort();

    const errors = [];
    for (const file of files) {
        const filePath = join(dataDir, file);
        const fileErrors = validateDataFile(filePath, file);
        errors.push(...fileErrors);
    }

    return {
        valid: errors.length === 0,
        checkedFiles: files.length,
        errors,
    };
}

function runCli() {
    const targetDir = process.argv[2] || 'data';
    try {
        const result = validateDataDir(targetDir);
        console.log(`🔍 Validating ${result.checkedFiles} JSON files in ${targetDir}...`);

        if (!result.valid) {
            for (const err of result.errors) {
                console.error(`❌ ${err.file} [campo: ${err.field}]: ${err.message}`);
            }
            console.error(`❌ Validação falhou com ${result.errors.length} erro(s).`);
            process.exit(1);
        }

        console.log(`🚀 All ${result.checkedFiles} data files are valid!`);
    } catch (err) {
        console.error(`❌ Error reading data directory (${targetDir}): ${err.message}`);
        process.exit(1);
    }
}

const isDirectExecution =
    process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
    runCli();
}
