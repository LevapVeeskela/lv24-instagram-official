/**
 * Конфигурация OAuth2 для Instagram Graph API
 */

/**
 * OAuth2 scope для Instagram Graph API
 */
export enum OAuth2Scope {
  /** Базовая информация о профиле */
  INSTAGRAM_BASIC = 'instagram_basic',
  
  /** Управление контентом (публикация) */
  INSTAGRAM_CONTENT_PUBLISH = 'instagram_content_publish',
  
  /** Чтение insights */
  INSTAGRAM_MANAGE_INSIGHTS = 'instagram_manage_insights',
  
  /** Управление комментариями */
  INSTAGRAM_MANAGE_COMMENTS = 'instagram_manage_comments',
  
  /** Управление сообщениями */
  INSTAGRAM_MANAGE_MESSAGES = 'instagram_manage_messages',
  
  /** Управление аккаунтом */
  PAGES_MANAGE_METADATA = 'pages_manage_metadata',
  
  /** Чтение сообщений страницы */
  PAGES_READ_ENGAGEMENT = 'pages_read_engagement',
  
  /** Чтение insights страницы */
  PAGES_READ_USER_CONTENT = 'pages_read_user_content',
  
  /** Публикация от имени страницы */
  PAGES_MANAGE_POSTS = 'pages_manage_posts',
  
  /** Чтение списка страниц */
  PAGES_SHOW_LIST = 'pages_show_list',
}

/**
 * Типы токенов
 */
export enum TokenType {
  /** Временный токен (1 час) */
  SHORT_LIVED = 'short_lived',
  /** Долговременный токен (60 дней) */
  LONG_LIVED = 'long_lived',
  /** Системный токен (бессрочный) */
  SYSTEM = 'system',
}

/**
 * Конфигурация OAuth2 приложения
 */
export interface OAuth2Config {
  /** App ID из Facebook Developer Console */
  appId: string;
  /** App Secret из Facebook Developer Console */
  appSecret: string;
  /** Redirect URI для OAuth2 flow */
  redirectUri: string;
  /**
   * Graph API version (например, 'v19.0').
   * Если не указана, используется `DEFAULT_OAUTH2_CONFIG.apiVersion`.
   */
  apiVersion?: string;
  /** Scope для авторизации */
  scopes: OAuth2Scope[];
}

/**
 * OAuth2 токены
 */
export interface OAuth2Tokens {
  /** Access token */
  accessToken: string;
  /** Token type (обычно 'Bearer') */
  tokenType: string;
  /** Время истечения в секундах (0 для бессрочных) */
  expiresIn: number;
  /** Refresh token (если доступен) */
  refreshToken?: string;
  /** Scope токена */
  scope: string;
  /** Время получения токена */
  receivedAt: number;
}

/**
 * Информация о пользователе из OAuth2
 */
export interface OAuth2UserInfo {
  /** Instagram user ID */
  id: string;
  /** Username */
  username: string;
  /** Полное имя */
  name?: string;
  /** URL аватара */
  picture?: {
    data: {
      height: number;
      isSiloed: boolean;
      url: string;
      width: number;
    };
  };
  /** Account type (BUSINESS, CREATOR, PERSONAL) */
  account_type?: string;
  /** Media count */
  media_count?: number;
  /** Followers count */
  followers_count?: number;
  /** Follows count */
  follows_count?: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_OAUTH2_CONFIG: Omit<Required<OAuth2Config>, 'appId' | 'appSecret' | 'redirectUri'> = {
  apiVersion: 'v18.0',
  scopes: [
    OAuth2Scope.INSTAGRAM_BASIC,
    OAuth2Scope.INSTAGRAM_MANAGE_INSIGHTS,
    OAuth2Scope.INSTAGRAM_MANAGE_COMMENTS,
  ],
};

/**
 * Получить URL для авторизации
 */
export function getAuthorizationUrl(config: OAuth2Config, state?: string): string {
  const apiVersion = config.apiVersion ?? DEFAULT_OAUTH2_CONFIG.apiVersion;
  const baseUrl = `https://www.facebook.com/${apiVersion}/dialog/oauth`;
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(','),
    response_type: 'code',
  });

  if (state) {
    params.append('state', state);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Получить URL для обмена кода на токен
 */
export function getTokenExchangeUrl(
  config: OAuth2Config,
  code: string
): string {
  const apiVersion = config.apiVersion ?? DEFAULT_OAUTH2_CONFIG.apiVersion;
  const baseUrl = `https://graph.facebook.com/${apiVersion}/oauth/access_token`;
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
    grant_type: 'authorization_code',
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Получить URL для обмена short-lived токена на long-lived
 */
export function getTokenExchangeUrlForLongLived(
  appId: string,
  appSecret: string,
  shortLivedToken: string,
  apiVersion: string = DEFAULT_OAUTH2_CONFIG.apiVersion
): string {
  const baseUrl = `https://graph.facebook.com/${apiVersion}/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  return `${baseUrl}?${params.toString()}`;
}
