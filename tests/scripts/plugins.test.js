import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
    CONSENT_VALUES,
    getPluginConfig,
    shouldLoadTelemetry,
    shouldShowConsentBanner,
} from '../../src/utils/plugins.js';

describe('plugins.js configuration and consent rules', () => {
    test('disables all plugins when env vars are missing, blank or malformed', () => {
        assert.deepEqual(getPluginConfig({}), {
            userwayId: null,
            clarityId: null,
            gaId: null,
            hasTelemetry: false,
        });

        assert.deepEqual(
            getPluginConfig({
                PUBLIC_USERWAY_ACCOUNT_ID: '   ',
                PUBLIC_CLARITY_PROJECT_ID: 'bad<script>id',
                PUBLIC_GA_MEASUREMENT_ID: 'UA-123456',
            }),
            {
                userwayId: null,
                clarityId: null,
                gaId: null,
                hasTelemetry: false,
            }
        );
    });

    test('accepts valid UserWay, Clarity and GA4 IDs independently', () => {
        const onlyUserWay = getPluginConfig({
            PUBLIC_USERWAY_ACCOUNT_ID: '  abcDEF1234  ',
        });
        assert.deepEqual(onlyUserWay, {
            userwayId: 'abcDEF1234',
            clarityId: null,
            gaId: null,
            hasTelemetry: false,
        });

        const full = getPluginConfig({
            PUBLIC_USERWAY_ACCOUNT_ID: 'userway_01',
            PUBLIC_CLARITY_PROJECT_ID: 'clarity1234',
            PUBLIC_GA_MEASUREMENT_ID: 'G-ABCD1234EF',
        });
        assert.deepEqual(full, {
            userwayId: 'userway_01',
            clarityId: 'clarity1234',
            gaId: 'G-ABCD1234EF',
            hasTelemetry: true,
        });
    });

    test('loads telemetry only when configured and explicitly accepted', () => {
        const withTelemetry = getPluginConfig({ PUBLIC_GA_MEASUREMENT_ID: 'G-TEST12345' });
        const withoutTelemetry = getPluginConfig({ PUBLIC_USERWAY_ACCOUNT_ID: 'userway_01' });

        assert.equal(shouldLoadTelemetry(null, withTelemetry), false);
        assert.equal(shouldLoadTelemetry(CONSENT_VALUES.REJECTED, withTelemetry), false);
        assert.equal(shouldLoadTelemetry(CONSENT_VALUES.ACCEPTED, withTelemetry), true);
        assert.equal(shouldLoadTelemetry(CONSENT_VALUES.ACCEPTED, withoutTelemetry), false);
    });

    test('shows consent banner only when telemetry is configured and no choice was saved', () => {
        const withTelemetry = getPluginConfig({ PUBLIC_CLARITY_PROJECT_ID: 'clarity1234' });
        const withoutTelemetry = getPluginConfig({});

        assert.equal(shouldShowConsentBanner(null, withTelemetry), true);
        assert.equal(shouldShowConsentBanner(CONSENT_VALUES.ACCEPTED, withTelemetry), false);
        assert.equal(shouldShowConsentBanner(CONSENT_VALUES.REJECTED, withTelemetry), false);
        assert.equal(shouldShowConsentBanner(null, withoutTelemetry), false);
    });
});

describe('plugin environment documentation and workflow passthrough', () => {
    test('.env.example documents all three PUBLIC_* plugin variables', () => {
        const envExample = readFileSync('.env.example', 'utf-8');
        assert.ok(envExample.includes('PUBLIC_USERWAY_ACCOUNT_ID='));
        assert.ok(envExample.includes('PUBLIC_CLARITY_PROJECT_ID='));
        assert.ok(envExample.includes('PUBLIC_GA_MEASUREMENT_ID='));
    });

    test('deploy.yml and daily-sync-deploy.yml pass PUBLIC_* vars to Astro build', () => {
        for (const workflowPath of [
            '.github/workflows/deploy.yml',
            '.github/workflows/daily-sync-deploy.yml',
        ]) {
            const content = readFileSync(workflowPath, 'utf-8');
            assert.ok(
                content.includes('PUBLIC_USERWAY_ACCOUNT_ID: ${{ vars.PUBLIC_USERWAY_ACCOUNT_ID }}'),
                `${workflowPath} should pass PUBLIC_USERWAY_ACCOUNT_ID`
            );
            assert.ok(
                content.includes('PUBLIC_CLARITY_PROJECT_ID: ${{ vars.PUBLIC_CLARITY_PROJECT_ID }}'),
                `${workflowPath} should pass PUBLIC_CLARITY_PROJECT_ID`
            );
            assert.ok(
                content.includes('PUBLIC_GA_MEASUREMENT_ID: ${{ vars.PUBLIC_GA_MEASUREMENT_ID }}'),
                `${workflowPath} should pass PUBLIC_GA_MEASUREMENT_ID`
            );
        }
    });
});
