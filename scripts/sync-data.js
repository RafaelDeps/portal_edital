import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    unlinkSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REPO_URL =
    process.env.RETRIEVE_EDITAL_REPO || 'https://github.com/RafaelDeps/retrieve_edital.git';
export const DEFAULT_TARGET_DIR = 'data';
export const DEFAULT_SOURCE_SUBDIR = join('data', 'output');
export const DEFAULT_MIN_FILES = Number(process.env.SYNC_MIN_FILES || 1);

function listJsonFiles(dir) {
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
}

/**
 * Espelha os arquivos *.json de sourceDir para targetDir.
 * Aborta sem alterar targetDir se sourceDir não existir ou tiver menos de minFiles JSONs.
 */
export function syncData({
    sourceDir,
    targetDir = DEFAULT_TARGET_DIR,
    minFiles = DEFAULT_MIN_FILES,
}) {
    if (!sourceDir || !existsSync(sourceDir)) {
        throw new Error(`Sincronização abortada: diretório de origem não encontrado (${sourceDir}).`);
    }

    const sourceFiles = listJsonFiles(sourceDir);
    if (sourceFiles.length < minFiles) {
        throw new Error(
            `Sincronização abortada: origem possui ${sourceFiles.length} arquivo(s) JSON (mínimo exigido: ${minFiles}). Diretório de destino preservado.`
        );
    }

    mkdirSync(targetDir, { recursive: true });

    const existingFiles = listJsonFiles(targetDir);
    const sourceSet = new Set(sourceFiles);
    const existingSet = new Set(existingFiles);

    const added = [];
    const updated = [];
    const removed = [];

    for (const file of sourceFiles) {
        copyFileSync(join(sourceDir, file), join(targetDir, file));
        if (existingSet.has(file)) {
            updated.push(file);
        } else {
            added.push(file);
        }
    }

    for (const file of existingFiles) {
        if (!sourceSet.has(file)) {
            unlinkSync(join(targetDir, file));
            removed.push(file);
        }
    }

    console.log(
        `✅ Sync concluído: ${sourceFiles.length} total (${added.length} novos, ${updated.length} atualizados, ${removed.length} removidos).`
    );

    return {
        total: sourceFiles.length,
        added,
        updated,
        removed,
    };
}

/**
 * Clona o repositório do coletor em diretório temporário e espelha data/output/*.json em targetDir.
 */
export function syncFromRepo({
    repoUrl = DEFAULT_REPO_URL,
    targetDir = DEFAULT_TARGET_DIR,
    sourceSubdir = DEFAULT_SOURCE_SUBDIR,
    minFiles = DEFAULT_MIN_FILES,
} = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), 'retrieve-edital-sync-'));
    try {
        console.log(`🔄 Clonando coletor: ${repoUrl}`);
        execFileSync('git', ['clone', '--depth', '1', repoUrl, tempDir], { stdio: 'inherit' });
        const sourceDir = join(tempDir, sourceSubdir);
        return syncData({ sourceDir, targetDir, minFiles });
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try {
        syncFromRepo();
    } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    }
}
