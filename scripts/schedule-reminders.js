import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './load-env.js';
import { normalizeCategory } from '../src/utils/category.js';
import { run as syncCategories } from './sync-categories.js';
import { PORTAL_URL } from './config.js';
import { escapeHtml, getOrCreateTopicId, sendMessage, sleep } from './telegram.js';

loadEnv();

const DEFAULT_DATA_DIR = 'data';
const DEFAULT_REGISTRY_FILE = join('registry', 'downloads_registry.json');

function getRegistry(registryPath) {
    if (existsSync(registryPath)) {
        try {
            return JSON.parse(readFileSync(registryPath, 'utf-8'));
        } catch (e) {
            console.error(`❌ Error reading registry: ${e.message}`);
            return {};
        }
    }
    return {};
}

export async function run(dataDir = DEFAULT_DATA_DIR, registryFile = DEFAULT_REGISTRY_FILE) {
    syncCategories(dataDir);
    const registry = getRegistry(registryFile);
    const files = existsSync(dataDir)
        ? readdirSync(dataDir).filter((file) => file.endsWith('.json'))
        : [];

    const today = new Date().toISOString().split('T')[0];
    console.log(`🔎 Checking reminders for: ${today}`);

    let stateChanged = false;

    for (const file of files) {
        const filePath = join(dataDir, file);
        try {
            const content = JSON.parse(readFileSync(filePath, 'utf-8'));
            const cronograma = content.cronograma || [];
            const editalName = content.nome || file;
            const category = normalizeCategory(content.categoria);
            const editalLink = content.link || PORTAL_URL;

            if (!registry[file]) {
                registry[file] = {
                    data_entrada: new Date().toISOString(),
                    categoria: category,
                    cronograma: cronograma,
                };
            }
            if (!registry[file].notificacoes_enviadas) {
                registry[file].notificacoes_enviadas = [];
            }

            for (const item of cronograma) {
                const eventDate = item.data;
                const eventName = item.evento;

                if (eventDate.includes(today)) {
                    const notificationKey = `${eventName}_${eventDate}`;

                    if (!registry[file].notificacoes_enviadas.includes(notificationKey)) {
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
                            registry[file].notificacoes_enviadas.push(notificationKey);
                            stateChanged = true;
                            await sleep(2000);
                        } else {
                            console.warn(`🛑 Skipping reminder tracking for ${file} due to failure.`);
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`❌ Error processing ${file}: ${err.message}`);
        }
    }

    if (stateChanged) {
        writeFileSync(registryFile, JSON.stringify(registry, null, 4));
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
