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
        ? readdirSync(dataDir).filter(
              (file) =>
                  file.endsWith('.json') &&
                  !file.includes('downloads_registry') &&
                  !file.includes('backup')
          )
        : [];
    const now = new Date().toISOString();
    let newItemsFound = false;

    for (const file of files) {
        if (!registry[file]) {
            console.log(`🆕 New edital detected: ${file}`);
            const filePath = join(dataDir, file);
            try {
                const content = JSON.parse(readFileSync(filePath, 'utf-8'));
                const title = content.nome || file;
                const link = content.link || '';
                const description = content.descrição || 'Sem descrição disponível.';
                const category = normalizeCategory(content.categoria);
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
                    registry[file] = {
                        data_entrada: now,
                        categoria: category,
                        cronograma: content.cronograma || [],
                    };
                    newItemsFound = true;
                    await sleep(2000);
                } else {
                    console.warn(`🛑 Skipping registry update for ${file} due to failure.`);
                }
            } catch (err) {
                console.error(`❌ Error processing ${file}: ${err.message}`);
            }
        }
    }

    if (newItemsFound) {
        writeFileSync(registryFile, JSON.stringify(registry, null, 4));
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
    run();
}
