import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const META_KEY = '_meta';

/**
 * Retorna chave estável do edital: fonte_key::link (quando fonte_key existe),
 * senão link; faz fallback para o nome do arquivo apenas se link não existir.
 */
export function getEditalKey(content, fallbackFile) {
    const link = typeof content?.link === 'string' ? content.link.trim() : '';
    const fonteKey = typeof content?.fonte_key === 'string' ? content.fonte_key.trim() : '';

    if (link) {
        return fonteKey ? `${fonteKey}::${link}` : link;
    }
    return fallbackFile;
}

/**
 * Uma entrada é considerada anunciada quando `anunciado` é true ou indefinido (compatibilidade legada).
 * Entradas criadas apenas por schedule-reminders.js têm `anunciado: false`.
 */
export function isAnnounced(entry) {
    if (!entry) return false;
    return entry.anunciado !== false;
}

export function loadRegistry(registryPath) {
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

export function saveRegistry(registryPath, registry) {
    writeFileSync(registryPath, JSON.stringify(registry, null, 4));
}

/**
 * Migra entradas legadas (indexadas por nome de arquivo .json) para a chave estável
 * usando os arquivos atualmente presentes em dataDir.
 */
export function migrateRegistry(registry, dataDir) {
    if (!existsSync(dataDir)) return false;

    const files = readdirSync(dataDir).filter(
        (file) =>
            file.endsWith('.json') &&
            !file.includes('downloads_registry') &&
            !file.includes('backup')
    );

    let migrated = false;

    for (const file of files) {
        if (!Object.prototype.hasOwnProperty.call(registry, file)) continue;

        try {
            const content = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
            const stableKey = getEditalKey(content, file);
            if (stableKey === file) continue;

            const legacyEntry = registry[file];
            const existingStable = registry[stableKey];

            const mergedNotifications = Array.from(
                new Set([
                    ...(existingStable?.notificacoes_enviadas || []),
                    ...(legacyEntry?.notificacoes_enviadas || []),
                ])
            );

            registry[stableKey] = {
                ...legacyEntry,
                ...existingStable,
                anunciado:
                    existingStable?.anunciado === true || legacyEntry?.anunciado !== false,
                notificacoes_enviadas: mergedNotifications,
            };

            delete registry[file];
            migrated = true;
        } catch {
            // Mantém entrada legada se o JSON não puder ser lido
        }
    }

    return migrated;
}
