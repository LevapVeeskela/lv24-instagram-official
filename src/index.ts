/**
 * @lv24/instagram-official — официальный Instagram Graph API клиент.
 *
 * Зависит только от `@lv24/kernel` и third-party. Без приватных импортов.
 */

// OAuth2
export {
  OAuth2Scope,
  TokenType,
  type OAuth2Config,
  type OAuth2Tokens,
  type OAuth2UserInfo,
  getAuthorizationUrl,
  getTokenExchangeUrl,
  getTokenExchangeUrlForLongLived,
  DEFAULT_OAUTH2_CONFIG,
} from './oauth2-config.js';
export { OAuth2Manager, OAuth2Error, FetchHttpClient } from './oauth2.js';

// Token management
export {
  TokenManager,
  type TokenStorage,
  type TokenManagerOptions,
  InMemoryTokenStorage,
  FileTokenStorage,
} from './token-manager.js';

// Base processor (минимальный, только http + session state)
export { BaseProcessor, type IProcessor } from './base-processor.js';

// Graph API processor
export { GraphApiProcessor, type IGraphApiProcessor } from './graph-api.js';

// Media extractor (используется Graph API) — реэкспорт из kernel
export { MediaExtractor } from '@lv24/kernel';
