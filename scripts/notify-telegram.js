import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './load-env.js';
import { normalizeCategory } from '../src/utils/category.js';
import { normalizeStatus } from '../src/utils/status.js';
import { run as syncCategories } from './sync-categories.js';
import { PORTAL_URL } from './config.js';
import { escapeHtml, getOrCreateTopicId, sendMessage, sleep } from './telegram.js';
import {
    getEditalKey,
    isAnnounced,
    loadRegistry,
    migrateRegistry,
    saveRegistry,
} from './registry.js';

loadEnv();

const DEFAULT_DATA_DIR = 'data';
const DEFAULT_REGISTRY_FILE = join('registry', 'downloads_registry.json');
export const DEFAULT_MAX_INDIVIDUAL = Number(process.env.TELEGRAM_MAX_INDIVIDUAL || 10);

function buildRegistryEntry(existingEntry, content, category, now) {
    return {
        ...(existingEntry || {}),
        data_entrada: existingEntry?.data_entrada || now,
        categoria: category,
        cronograma: content.cronograma || [],
        anunciado: true,
        notificacoes_enviadas: existingEntry?.notificacoes_enviadas || [],
    };
}

export function buildSummaryMessage(items) {
    const countsByOrgao = new Map();
    for (const { content } of items) {
        const orgao = (content.orgão_fomento || 'Outros').trim() || 'Outros';
        countsByOrgao.set(orgao, (countsByOrgao.get(orgao) || 0) + 1);
    }

    const breakdownLines = [...countsByOrgao.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
        .map(([orgao, count]) => `• <b>${escapeHtml(orgao)}:</b> ${count}`)
        .join('\n');

    return (
        `📥 <b>${items.length} novos editais disponíveis no portal!</b>\n\n` +
        `${breakdownLines}\n\n` +
        `<b>🌐 Portal de Editais:</b> <a href="${escapeHtml(PORTAL_URL)}">Ver todos os editais</a>`
    );
}

export async function run(
    dataDir = DEFAULT_DATA_DIR,
    registryFile = DEFAULT_REGISTRY_FILE,
    { seed = false, maxIndividual = DEFAULT_MAX_INDIVIDUAL, delayMs = 2000 } = {}
) {
    syncCategories(dataDir);
    const registry = loadRegistry(registryFile);
    let registryChanged = migrateRegistry(registry, dataDir);

    const files = existsSync(dataDir)
        ? readdirSync(dataDir).filter(
              (file) =>
                  file.endsWith('.json') &&
                  !file.includes('downloads_registry') &&
                  !file.includes('backup')
          )
        : [];
    const now = new Date().toISOString();

    const pendingEligible = [];
    const pendingClosed = [];
    const seenKeys = new Set();

    for (const file of files) {
        const filePath = join(dataDir, file);
        try {
            const content = JSON.parse(readFileSync(filePath, 'utf-8'));
            const key = getEditalKey(content, file);
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            if (isAnnounced(registry[key])) continue;

            const category = normalizeCategory(content.categoria);
            const status = normalizeStatus(content.status);

            if (seed) {
                registry[key] = buildRegistryEntry(registry[key], content, category, now);
                registryChanged = true;
                continue;
            }

            if (status === 'encerrado') {
                pendingClosed.push({ file, key, content, category });
            } else {
                pendingEligible.push({ file, key, content, category });
            }
        } catch (err) {
            console.error(`❌ Error processing ${file}: ${err.message}`);
        }
    }

    if (seed) {
        if (registryChanged) {
            saveRegistry(registryFile, registry);
            console.log(`🌱 Seed concluído: registro atualizado sem envio de mensagens.`);
        } else {
            console.log('🌱 Seed concluído: nenhum arquivo novo para registrar.');
        }
        return;
    }

    for (const { file, key, content, category } of pendingClosed) {
        console.log(`⏭️ Ignorando anúncio de edital encerrado: ${file}`);
        registry[key] = buildRegistryEntry(registry[key], content, category, now);
        registryChanged = true;
    }

    if (pendingEligible.length > maxIndividual) {
        console.log(
            `📦 ${pendingEligible.length} novos editais excedem o limite individual (${maxIndividual}). Enviando resumo único.`
        );
        const summaryMessage = buildSummaryMessage(pendingEligible);
        const success = await sendMessage(summaryMessage, null, {
            successLog: '✅ Telegram summary notification sent!',
        });

        if (success) {
            for (const { key, content, category } of pendingEligible) {
                registry[key] = buildRegistryEntry(registry[key], content, category, now);
            }
            registryChanged = true;
        } else {
            console.warn('🛑 Skipping registry update for batch due to summary send failure.');
        }
    } else {
        for (const { file, key, content, category } of pendingEligible) {
            console.log(`🆕 New edital detected: ${file}`);
            const title = content.nome || file;
            const link = content.link || '';
            const description = content.descrição || 'Sem descrição disponível.';
            const orgaoFomento = content.orgão_fomento || 'N/A';

            let eventInfo = 'N/A';
            if (content.cronograma && content.cronograma.length > 0) {
                const firstEvent = content.cronograma[0];
                eventInfo = `${firstEvent.evento} (${firstEvent.data})`;
            }

            const shortDescription =
                description.length > 300 ? description.substring(0, 297) + '...' : description;

            const message =
                `🔔 <b>Novo Edital Detectado!</b>\n\n` +
                `<b>📌 Título:</b> ${escapeHtml(title)}\n` +
                `<b>📁 Categoria:</b> ${escapeHtml(category)}\n` +
                `<b>🏛️ Órgão de Fomento:</b> ${escapeHtml(orgaoFomento)}\n` +
                `<b>📅 Próximo Evento:</b> ${escapeHtml(eventInfo)}\n\n` +
                `<b>📝 Descrição:</b> <i>${escapeHtml(shortDescription)}</i>\n\n` +
                `<b>🔗 Link do Edital:</b> <a href="${escapeHtml(link)}">Acessar Documento</a>\n` +
                `<b>🌐 Portal de Editais:</b> <a href="${escapeHtml(PORTAL_URL)}">Ver todos os editais</a>`;

            const topicId = await getOrCreateTopicId(category);
            const success = await sendMessage(message, topicId);

            if (success) {
                registry[key] = buildRegistryEntry(registry[key], content, category, now);
                registryChanged = true;
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            } else {
                console.warn(`🛑 Skipping registry update for ${file} due to failure.`);
            }
        }
    }

    if (registryChanged) {
        saveRegistry(registryFile, registry);
        console.log('💾 Registry updated.');
    } else {
        console.log('✨ No new editals found.');
    }
}

if (
    process.argv[1] &&
    (process.argv[1].endsWith('notify-telegram.js') ||
        fileURLToPath(import.meta.url) === process.argv[1])
) {
    const seed = process.argv.includes('--seed');
    run(DEFAULT_DATA_DIR, DEFAULT_REGISTRY_FILE, { seed });
}
