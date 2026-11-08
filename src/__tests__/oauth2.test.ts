import { describe, it, expect, vi } from 'vitest';
import type { IHttpClient, HttpResponse } from '@lv24/kernel';
import { OAuth2Manager, OAuth2Error } from '../oauth2.js';
import {
  DEFAULT_OAUTH2_CONFIG,
  OAuth2Scope,
  getAuthorizationUrl,
  getTokenExchangeUrl,
  getTokenExchangeUrlForLongLived,
} from '../oauth2-config.js';
import { TokenManager, InMemoryTokenStorage } from '../token-manager.js';
import type { OAuth2Config, OAuth2Tokens } from '../oauth2-config.js';

const config: OAuth2Config = {
  appId: 'app123',
  appSecret: 'secret',
  redirectUri: 'https://example.com/callback',
  apiVersion: 'v18.0',
  scopes: [OAuth2Scope.INSTAGRAM_BASIC],
};

function mockResponse(body: unknown, statusCode = 200): HttpResponse {
  return {
    statusCode,
    headers: {},
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
  };
}

function mockClient(response: HttpResponse): IHttpClient {
  return { send: vi.fn().mockResolvedValue(response), setProxy: vi.fn() };
}

const tokens: OAuth2Tokens = {
  accessToken: 'tok',
  tokenType: 'Bearer',
  expiresIn: 3600,
  scope: 'instagram_basic',
  receivedAt: Date.now(),
};

describe('OAuth2Manager', () => {
  it('builds an authorization URL with client_id, redirect and state', () => {
    const manager = new OAuth2Manager(config, mockClient(mockResponse({})));
    const url = new URL(manager.getAuthorizationUrl('state123'));

    expect(url.searchParams.get('client_id')).toBe('app123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state123');
  });

  it('exchanges a code for tokens', async () => {
    const http = mockClient(
      mockResponse({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600, scope: 'instagram_basic' }),
    );
    const manager = new OAuth2Manager(config, http);

    const result = await manager.exchangeCodeForToken('code123');

    expect(result.accessToken).toBe('tok');
    expect(result.expiresIn).toBe(3600);
    expect(http.send).toHaveBeenCalledOnce();
    const sentUrl = (http.send as ReturnType<typeof vi.fn>).mock.calls[0][0].url as string;
    expect(sentUrl).toContain('code=code123');
  });

  it('throws OAuth2Error when code exchange fails', async () => {
    const http = mockClient(
      mockResponse({ error: { message: 'Invalid code', code: 'TOKEN_EXCHANGE_FAILED' } }, 400),
    );
    const manager = new OAuth2Manager(config, http);

    await expect(manager.exchangeCodeForToken('bad')).rejects.toThrowError(OAuth2Error);
  });

  it('exchanges a short-lived token for a long-lived token', async () => {
    const http = mockClient(
      mockResponse({ access_token: 'long', token_type: 'Bearer', expires_in: 5184000 }),
    );
    const manager = new OAuth2Manager(config, http);

    const result = await manager.exchangeToLongLivedToken('short');

    expect(result.accessToken).toBe('long');
    expect(result.expiresIn).toBe(5184000);
  });

  it('maps validateToken true/false from debug_token payload', async () => {
    const valid = new OAuth2Manager(config, mockClient(mockResponse({ data: { is_valid: true } })));
    const invalid = new OAuth2Manager(config, mockClient(mockResponse({ data: { is_valid: false } })));
    const errored = new OAuth2Manager(config, mockClient(mockResponse({ error: {} }, 400)));

    expect(await valid.validateToken('tok')).toBe(true);
    expect(await invalid.validateToken('tok')).toBe(false);
    expect(await errored.validateToken('tok')).toBe(false);
  });

  it('detects expired and perpetual tokens', () => {
    const manager = new OAuth2Manager(config, mockClient(mockResponse({})));

    expect(manager.isTokenExpired({ ...tokens, receivedAt: Date.now() - 2 * 3600 * 1000 })).toBe(true);
    expect(manager.isTokenExpired(tokens)).toBe(false);
    expect(manager.isTokenExpired({ ...tokens, expiresIn: 0 })).toBe(false);
  });

  it('exposes DEFAULT_OAUTH2_CONFIG', () => {
    expect(DEFAULT_OAUTH2_CONFIG.apiVersion).toBe('v18.0');
    expect(DEFAULT_OAUTH2_CONFIG.scopes).toContain(OAuth2Scope.INSTAGRAM_BASIC);
  });
});

describe('apiVersion handling', () => {
  const v19Config: OAuth2Config = { ...config, apiVersion: 'v19.0' };

  it('uses config.apiVersion in authorization and token-exchange URLs', () => {
    expect(getAuthorizationUrl(v19Config, 's')).toContain(
      'https://www.facebook.com/v19.0/dialog/oauth',
    );
    expect(getTokenExchangeUrl(v19Config, 'code')).toContain(
      'https://graph.facebook.com/v19.0/oauth/access_token',
    );
    expect(getTokenExchangeUrlForLongLived('app123', 'secret', 'short', 'v19.0')).toContain(
      'https://graph.facebook.com/v19.0/oauth/access_token',
    );
  });

  it('defaults to DEFAULT_OAUTH2_CONFIG.apiVersion when apiVersion is omitted', () => {
    const minimal: OAuth2Config = {
      appId: 'app123',
      appSecret: 'secret',
      redirectUri: 'https://example.com/callback',
      scopes: [OAuth2Scope.INSTAGRAM_BASIC],
    };
    const fallback = DEFAULT_OAUTH2_CONFIG.apiVersion;

    expect(getAuthorizationUrl(minimal, 's')).toContain(`facebook.com/${fallback}/dialog/oauth`);
    expect(getTokenExchangeUrl(minimal, 'code')).toContain(`graph.facebook.com/${fallback}/`);
    expect(getTokenExchangeUrlForLongLived('app123', 'secret', 'short')).toContain(
      `graph.facebook.com/${fallback}/`,
    );
  });

  it('manager sends versioned URLs for every endpoint', async () => {
    const http = mockClient(
      mockResponse({
        access_token: 'tok',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'instagram_basic',
        id: 'user-1',
        username: 'testuser',
        data: {
          app_id: 'app123',
          type: 'USER',
          application: 'Test App',
          data_access_expires_at: 1700000000,
          expires_at: 1700000000,
          is_valid: true,
          issued_at: 1690000000,
          scopes: ['instagram_basic'],
          user_id: 'user-1',
        },
      }),
    );
    const manager = new OAuth2Manager(v19Config, http);

    expect(manager.getAuthorizationUrl('s')).toContain('/v19.0/dialog/oauth');
    await manager.exchangeCodeForToken('code123');
    await manager.exchangeToLongLivedToken('short');
    await manager.getUserInfo('tok');
    await manager.validateToken('tok');
    await manager.getTokenInfo('tok');
    await manager.revokeToken('tok');

    const calls = (http.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(6);
    for (const [options] of calls) {
      expect((options as { url: string }).url).toContain('/v19.0/');
    }
  });
});

describe('TokenManager', () => {
  it('saves, reads, checks and deletes tokens', async () => {
    const manager = new TokenManager({ storage: new InMemoryTokenStorage(), autoRefresh: false });

    expect(await manager.get('user1')).toBeNull();
    await manager.save('user1', tokens);
    expect(await manager.get('user1')).toEqual(tokens);
    expect(await manager.has('user1')).toBe(true);
    expect(await manager.getAllUserIds()).toEqual(['user1']);
    await manager.delete('user1');
    expect(await manager.has('user1')).toBe(false);
  });
});
