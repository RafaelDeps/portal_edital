import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './load-env.js';
import { normalizeCategory } from '../src/utils/category.js';
import { run as syncCategories } from './sync-categories.js';
import { PORTAL_URL } from './config.js';
import { escapeHtml, getOrCreateTopicId, sendMessage, sleep } from './telegram.js';
import {
    META_KEY,
    getEditalKey,
    loadRegistry,
    migrateRegistry,
    saveRegistry,
} from './registry.js';

loadEnv();

const DEFAULT_DATA_DIR = 'data';
const DEFAULT_REGISTRY_FILE = join('registry', 'downloads_registry.json');
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

export function extractIsoDate(eventDate) {
    if (typeof eventDate !== 'string') return null;
    const match = eventDate.match(ISO_DATE_RE);
    return match ? match[1] : null;
}

export function isDateInRecoveryWindow(isoDate, windowStart, windowEnd) {
    if (!isoDate) return false;
    return isoDate >= windowStart && isoDate <= windowEnd;
}

export async function run(
    dataDir = DEFAULT_DATA_DIR,
    registryFile = DEFAULT_REGISTRY_FILE,
    { today = new Date().toISOString().split('T')[0], delayMs = 2000 } = {}
) {
    syncCategories(dataDir);
    const registry = loadRegistry(registryFile);
    let stateChanged = migrateRegistry(registry, dataDir);

    const files = existsSync(dataDir)
        ? readdirSync(dataDir).filter((file) => file.endsWith('.json'))
        : [];

    const lastRun = registry[META_KEY]?.last_reminders_run;
    const windowStart = lastRun && lastRun < today ? lastRun : today;
    console.log(`🔎 Checking reminders for window: ${windowStart} .. ${today}`);

    let hadSendFailure = false;

    for (const file of files) {
        const filePath = join(dataDir, file);
        try {
            const content = JSON.parse(readFileSync(filePath, 'utf-8'));
            const cronograma = Array.isArray(content.cronograma) ? content.cronograma : [];
            const editalName = content.nome || file;
            const category = normalizeCategory(content.categoria);
            const editalLink = content.link || PORTAL_URL;
            const key = getEditalKey(content, file);

            const sentList = Array.isArray(registry[key]?.notificacoes_enviadas)
                ? registry[key].notificacoes_enviadas
                : [];

            for (const item of cronograma) {
                if (!item || typeof item.data !== 'string') {
                    console.warn(
                        `⚠️ Evento com data inválida em ${file} (${item?.evento || 'sem nome'}). Pulando evento.`
                    );
                    continue;
                }

                const eventDate = item.data;
                const eventName = item.evento || 'Evento';
                const isoDate = extractIsoDate(eventDate);

                if (!isDateInRecoveryWindow(isoDate, windowStart, today)) {
                    continue;
                }

                const notificationKey = `${eventName}_${eventDate}`;
                if (sentList.includes(notificationKey)) {
                    continue;
                }

                console.log(`⏰ Reminder trigger: ${editalName} - ${eventName}`);

                const message =
                    `⏰ <b>Lembrete de Cronograma!</b>\n\n` +
                    `<b>📌 Edital:</b> ${escapeHtml(editalName)}\n` +
                    `<b>📁 Categoria:</b> ${escapeHtml(category)}\n` +
                    `<b>📅 Evento:</b> <i>${escapeHtml(eventName)}</i>\n` +
                    `<b>ℹ️ Data prevista:</b> ${escapeHtml(eventDate)}\n\n` +
                    `<b>🌐 Ver mais no portal:</b> <a href="${escapeHtml(PORTAL_URL)}">Acessar site</a>\n` +
                    `<b>🔗 Link direto:</b> <a href="${escapeHtml(editalLink)}">Abrir documento</a>`;

                const topicId = await getOrCreateTopicId(category);
                const success = await sendMessage(message, topicId, {
                    successLog: '✅ Telegram reminder sent!',
                });

                if (success) {
                    if (!registry[key]) {
                        registry[key] = {
                            anunciado: false,
                            notificacoes_enviadas: [],
                        };
                    }
                    if (!Array.isArray(registry[key].notificacoes_enviadas)) {
                        registry[key].notificacoes_enviadas = [];
                    }
                    registry[key].notificacoes_enviadas.push(notificationKey);
                    sentList.push(notificationKey);
                    stateChanged = true;
                    if (delayMs > 0) {
                        await sleep(delayMs);
                    }
                } else {
                    hadSendFailure = true;
                    console.warn(`🛑 Skipping reminder tracking for ${file} due to failure.`);
                }
            }
        } catch (err) {
            console.error(`❌ Error processing ${file}: ${err.message}`);
        }
    }

    if (!hadSendFailure && registry[META_KEY]?.last_reminders_run !== today) {
        registry[META_KEY] = {
            ...(registry[META_KEY] || {}),
            last_reminders_run: today,
        };
        stateChanged = true;
    }

    if (stateChanged) {
        saveRegistry(registryFile, registry);
        console.log('💾 Registry updated with sent notifications.');
    } else {
        console.log('✨ No reminders to send today.');
    }
}

if (
    process.argv[1] &&
    (process.argv[1].endsWith('schedule-reminders.js') ||
        fileURLToPath(import.meta.url) === process.argv[1])
) {
    run();
}
