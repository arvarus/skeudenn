import { describe, expect, it } from 'vitest';

import { formatAppInfo, isAppLink, isNewerVersion, type AppInfo } from './app';

describe('isAppLink', () => {
  it('accepts the known link keys only', () => {
    expect(isAppLink('repository')).toBe(true);
    expect(isAppLink('documentation')).toBe(true);
    expect(isAppLink('license')).toBe(true);
    expect(isAppLink('https://example.com')).toBe(false);
    expect(isAppLink('toString')).toBe(false);
    expect(isAppLink(undefined)).toBe(false);
  });
});

describe('formatAppInfo', () => {
  it('lists the app and runtime versions, one per line', () => {
    const info: AppInfo = {
      name: 'Skeudenn',
      version: '0.2.1',
      electron: '38.0.0',
      chrome: '140.0.0.0',
      node: '22.18.0',
      v8: '14.0.0',
      platform: 'linux',
      arch: 'x64',
    };
    expect(formatAppInfo(info)).toBe(
      'Skeudenn 0.2.1\nElectron 38.0.0\nChromium 140.0.0.0\nNode.js 22.18.0\nV8 14.0.0\nlinux x64',
    );
  });
});

describe('isNewerVersion', () => {
  it('compares versions numerically, part by part', () => {
    expect(isNewerVersion('0.5.0', 'v0.6.0')).toBe(true);
    expect(isNewerVersion('0.5.0', '0.5.1')).toBe(true);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(true);
    expect(isNewerVersion('0.5', '0.5.1')).toBe(true);
  });

  it('is false for the same, an older or an unreadable version', () => {
    expect(isNewerVersion('0.5.0', 'v0.5.0')).toBe(false);
    expect(isNewerVersion('0.5.0', '0.4.9')).toBe(false);
    expect(isNewerVersion('0.5.0', 'latest')).toBe(false);
    expect(isNewerVersion('dev', '1.0.0')).toBe(false);
  });
});
