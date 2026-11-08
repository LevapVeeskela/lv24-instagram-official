/**
 * OAuth2 Manager для Instagram Graph API.
 *
 * Управляет OAuth2 flow:
 * - Генерация URL авторизации
 * - Обмен кода на токен
 * - Refresh токенов
 * - Валидация токенов
 *
 * Транспорт — через `IHttpClient` из `@lv24/kernel`, поэтому менеджер
 * тестируется с моком и не зависит от глобального fetch.
 *
 * @example
 * ```typescript
 * import { OAuth2Manager } from '@lv24/instagram-official';
 * import { UndiciHttpClient } from '@lv24/kernel';
 *
 * const oauth2Manager = new OAuth2Manager(
 *   {
 *     appId: '123456789',
 *     appSecret: 'secret',
 *     redirectUri: 'https://example.com/callback',
 *   },
 *   new UndiciHttpClient(),
 * );
 *
 * // Получить URL авторизации
 * const authUrl = oauth2Manager.getAuthorizationUrl();
 *
 * // После редиректа пользователя получить код из URL
 * const code = new URL(request.url).searchParams.get('code');
 *
 * // Обменять код на токен
 * const tokens = await oauth2Manager.exchangeCodeForToken(code);
 * ```
 */

import type { IHttpClient, HttpRequestOptions, HttpResponse } from '@lv24/kernel';
import {
  getAuthorizationUrl,
  getTokenExchangeUrl,
  getTokenExchangeUrlForLongLived,
  DEFAULT_OAUTH2_CONFIG,
  type OAuth2Config,
  type OAuth2Tokens,
  type OAuth2UserInfo,
} from './oauth2-config.js';

/**
 * Fetch-адаптер IHttpClient по умолчанию (глобальный fetch, без прокси).
 */
export class FetchHttpClient implements IHttpClient {
  setProxy(_proxyUrl: string | null): void {
    // Прокси не поддерживается fetch-адаптером; используйте UndiciHttpClient из @lv24/kernel.
  }

  async send(options: HttpRequestOptions): Promise<HttpResponse> {
    const url = buildUrlWithQuery(options.url, options.query);
    const init: RequestInit = { method: options.method, headers: options.headers };
    if (options.body !== undefined) {
      // Normalize to string (RequestInit body typing comes from @types/node fetch types)
      if (options.body instanceof URLSearchParams) {
        init.body = options.body.toString();
      } else if (typeof options.body === 'string') {
        init.body = options.body;
      } else if (options.body instanceof Buffer) {
        init.body = options.body.toString('utf-8');
      }
    }
    const response = await fetch(url, init);
    const rawText = await response.text();
    const rawBody = Buffer.from(rawText);
    const contentType = response.headers.get('content-type') ?? '';
    let body: unknown = rawText;
    if (contentType.includes('application/json')) {
      try {
        body = JSON.parse(rawText) as unknown;
      } catch {
        body = rawText;
      }
    }
    const headers: Record<string, string | string[] | undefined> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      statusCode: response.status,
      headers,
      body,
      rawBody,
      url,
      method: options.method,
    };
  }
}

function buildUrlWithQuery(
  baseUrl: string,
  query?: Record<string, string | number | boolean>,
): string {
  if (!query || Object.keys(query).length === 0) {
    return baseUrl;
  }
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.append(key, String(value));
  }
  return url.toString();
}

export class OAuth2Manager {
  private config: OAuth2Config;
  private httpClient: IHttpClient;

  constructor(config: OAuth2Config, httpClient: IHttpClient = new FetchHttpClient()) {
    this.config = config;
    this.httpClient = httpClient;
  }

  /**
   * Graph API версия из конфига (по умолчанию `DEFAULT_OAUTH2_CONFIG.apiVersion`).
   */
  private apiVersion(): string {
    return this.config.apiVersion ?? DEFAULT_OAUTH2_CONFIG.apiVersion;
  }

  /**
   * Получить URL для авторизации пользователя
   *
   * @param state - Уникальный state для защиты от CSRF
   * @returns URL для редиректа пользователя
   */
  getAuthorizationUrl(state?: string): string {
    const actualState = state || this.generateState();
    return getAuthorizationUrl(this.config, actualState);
  }

  /**
   * Обменять код авторизации на access token
   *
   * @param code - Код авторизации из callback URL
   * @returns OAuth2 токены
   */
  async exchangeCodeForToken(code: string): Promise<OAuth2Tokens> {
    const url = getTokenExchangeUrl(this.config, code);

    const response = await this.httpClient.send({ url, method: 'GET' });
    const data = parseJsonBody(response);

    if (response.statusCode >= 400) {
      const error = data.error as Record<string, unknown> | undefined;
      throw new OAuth2Error(
        (error?.message as string) || 'Failed to exchange code for token',
        (error?.code as string) || 'TOKEN_EXCHANGE_FAILED',
      );
    }

    return {
      accessToken: data.access_token as string,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: (data.expires_in as number) || 0,
      scope: (data.scope as string) || '',
      receivedAt: Date.now(),
    };
  }

  /**
   * Обменять short-lived токен на long-lived (60 дней)
   *
   * @param shortLivedToken - Временный токен
   * @returns Долговременные токены
   */
  async exchangeToLongLivedToken(shortLivedToken: string): Promise<OAuth2Tokens> {
    const url = getTokenExchangeUrlForLongLived(
      this.config.appId,
      this.config.appSecret,
      shortLivedToken,
      this.apiVersion(),
    );

    const response = await this.httpClient.send({ url, method: 'GET' });
    const data = parseJsonBody(response);

    if (response.statusCode >= 400) {
      const error = data.error as Record<string, unknown> | undefined;
      throw new OAuth2Error(
        (error?.message as string) || 'Failed to exchange to long-lived token',
        (error?.code as string) || 'LONG_LIVED_TOKEN_EXCHANGE_FAILED',
      );
    }

    return {
      accessToken: data.access_token as string,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: (data.expires_in as number) || 5184000, // 60 дней
      scope: (data.scope as string) || '',
      refreshToken: (data.refresh_token as string) || undefined,
      receivedAt: Date.now(),
    };
  }

  /**
   * Получить информацию о пользователе
   *
   * @param accessToken - Access token
   * @returns Информация о пользователе
   */
  async getUserInfo(accessToken: string): Promise<OAuth2UserInfo> {
    const fields = [
      'id',
      'username',
      'name',
      'picture',
      'account_type',
      'media_count',
      'followers_count',
      'follows_count',
    ].join(',');

    const url = `https://graph.facebook.com/${this.apiVersion()}/me?fields=${fields}&access_token=${accessToken}`;

    const response = await this.httpClient.send({ url, method: 'GET' });
    const data = parseJsonBody(response);

    if (response.statusCode >= 400) {
      const error = data.error as Record<string, unknown> | undefined;
      throw new OAuth2Error(
        (error?.message as string) || 'Failed to get user info',
        (error?.code as string) || 'USER_INFO_FETCH_FAILED',
      );
    }

    return data as unknown as OAuth2UserInfo;
  }

  /**
   * Проверить валидность токена
   *
   * @param accessToken - Access token для проверки
   * @returns true если токен валиден
   */
  async validateToken(accessToken: string): Promise<boolean> {
    const url = `https://graph.facebook.com/${this.apiVersion()}/debug_token?input_token=${accessToken}&access_token=${this.config.appId}|${this.config.appSecret}`;

    const response = await this.httpClient.send({ url, method: 'GET' });
    const data = parseJsonBody(response);

    if (response.statusCode >= 400) {
      return false;
    }

    const dataData = data.data as Record<string, unknown> | undefined;
    return (dataData?.is_valid as boolean) || false;
  }

  /**
   * Получить информацию о токене
   *
   * @param accessToken - Access token
   * @returns Информация о токене
   */
  async getTokenInfo(accessToken: string): Promise<{
    appId: string;
    type: string;
    application: string;
    dataAccessExpiresAt: number;
    expiresAt: number;
    isValid: boolean;
    issuedAt: number;
    scopes: string[];
    userId: string;
  }> {
    const url = `https://graph.facebook.com/${this.apiVersion()}/debug_token?input_token=${accessToken}&access_token=${this.config.appId}|${this.config.appSecret}`;

    const response = await this.httpClient.send({ url, method: 'GET' });
    const data = parseJsonBody(response);

    if (response.statusCode >= 400 || !data.data) {
      throw new OAuth2Error('Failed to get token info', 'TOKEN_INFO_FETCH_FAILED');
    }

    const tokenData = data.data as Record<string, unknown>;
    return {
      appId: tokenData.app_id as string,
      type: tokenData.type as string,
      application: tokenData.application as string,
      dataAccessExpiresAt: tokenData.data_access_expires_at as number,
      expiresAt: tokenData.expires_at as number,
      isValid: tokenData.is_valid as boolean,
      issuedAt: tokenData.issued_at as number,
      scopes: (tokenData.scopes as string[]) || [],
      userId: tokenData.user_id as string,
    };
  }

  /**
   * Отозвать токен
   *
   * @param accessToken - Access token для отзыва
   * @returns true если токен успешно отозван
   */
  async revokeToken(accessToken: string): Promise<boolean> {
    const url = `https://graph.facebook.com/${this.apiVersion()}/oauth/access_token?client_id=${this.config.appId}&client_secret=${this.config.appSecret}&access_token=${accessToken}&grant_type=fb_revoke_token`;

    const response = await this.httpClient.send({ url, method: 'DELETE' });
    return response.statusCode < 400;
  }

  /**
   * Проверить, истёк ли токен
   *
   * @param tokens - OAuth2 токены
   * @returns true если токен истёк
   */
  isTokenExpired(tokens: OAuth2Tokens): boolean {
    if (tokens.expiresIn === 0) {
      return false; // Бессрочный токен
    }

    const now = Date.now();
    const expiresAt = tokens.receivedAt + tokens.expiresIn * 1000;

    // Считаем токен истёкшим за 5 минут до фактического истечения
    return now >= expiresAt - 5 * 60 * 1000;
  }

  /**
   * Сгенерировать уникальный state для защиты от CSRF
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * OAuth2 ошибка
 */
export class OAuth2Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'OAuth2Error';
  }
}

function parseJsonBody(response: HttpResponse): Record<string, unknown> {
  const body = response.body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object' && body !== null) {
    return body as Record<string, unknown>;
  }
  return {};
}
