import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_TOPICS_REGISTRY = join('registry', 'topics_registry.json');
export const DEFAULT_MAX_RETRIES = 3;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Escapa caracteres especiais para uso seguro com parse_mode: 'HTML' da API do Telegram
 * (incluindo atributos href).
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function getOrCreateTopicId(
    category,
    {
        topicsRegistryFile = DEFAULT_TOPICS_REGISTRY,
        maxRetries = DEFAULT_MAX_RETRIES,
        sleepFn = sleep,
    } = {}
) {
    if (!category || category === 'N/A' || category.toLowerCase() === 'sem categoria') return null;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) return null;

    let topics = {};
    if (existsSync(topicsRegistryFile)) {
        topics = JSON.parse(readFileSync(topicsRegistryFile, 'utf-8'));
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (topics[normalizedCategory]) return topics[normalizedCategory];

    console.log(`🏗️ Creating new Telegram topic for category: ${category}`);
    const url = `https://api.telegram.org/bot${token}/createForumTopic`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    name: category.charAt(0).toUpperCase() + category.slice(1),
                }),
            });

            const result = await response.json();
            if (result.ok) {
                const topicId = result.result.message_thread_id;
                topics[normalizedCategory] = topicId;
                writeFileSync(topicsRegistryFile, JSON.stringify(topics, null, 4));
                return topicId;
            }

            if (result.error_code === 429) {
                if (attempt >= maxRetries) {
                    console.error(
                        `❌ Rate limit persistente ao criar tópico "${category}" após ${maxRetries} tentativas.`
                    );
                    return null;
                }
                const waitTime = (result.parameters?.retry_after || 5) * 1000;
                console.warn(
                    `🛑 Rate limited while creating topic (tentativa ${attempt}/${maxRetries}). Waiting ${waitTime / 1000}s...`
                );
                await sleepFn(waitTime);
                continue;
            }

            console.error(`❌ Failed to create topic: ${result.description}`);
            return null;
        } catch (err) {
            console.error(`❌ Error creating topic: ${err.message}`);
            return null;
        }
    }

    return null;
}

export async function sendMessage(
    text,
    topicId = null,
    {
        maxRetries = DEFAULT_MAX_RETRIES,
        sleepFn = sleep,
        successLog = '✅ Telegram notification sent!',
    } = {}
) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn('⚠️ Telegram credentials not found. Skipping notification.');
        return false;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_thread_id: topicId,
                    text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: false,
                }),
            });

            if (response.ok) {
                console.log(successLog);
                return true;
            }

            const result = await response.json();
            if (result.error_code === 429) {
                if (attempt >= maxRetries) {
                    console.error(
                        `❌ Rate limit persistente ao enviar mensagem após ${maxRetries} tentativas. Desistindo.`
                    );
                    return false;
                }
                const waitTime = (result.parameters?.retry_after || 5) * 1000;
                console.warn(
                    `🛑 Rate limited (tentativa ${attempt}/${maxRetries}). Waiting ${waitTime / 1000}s...`
                );
                await sleepFn(waitTime);
                continue;
            }

            console.error(`❌ Failed to send Telegram message: ${result.description}`);
            return false;
        } catch (err) {
            console.error(`❌ Error sending Telegram message: ${err.message}`);
            return false;
        }
    }

    return false;
}
