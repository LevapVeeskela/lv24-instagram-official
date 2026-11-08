/**
 * Token Manager для управления OAuth2 токенами
 *
 * Управляет жизненным циклом токенов:
 * - Безопасное хранение
 * - Автоматический refresh
 * - Кэширование
 *
 * @example
 * ```typescript
 * const tokenManager = new TokenManager({
 *   storage: new InMemoryTokenStorage(),
 *   autoRefresh: true,
 *   refreshThreshold: 3600, // Refresh за 1 час до истечения
 * });
 *
 * // Сохранить токены
 * await tokenManager.save('user123', tokens);
 *
 * // Получить токены (с авто-refresh)
 * const tokens = await tokenManager.get('user123');
 *
 * // Удалить токены
 * await tokenManager.delete('user123');
 * ```
 */
export class TokenManager {
  private storage: TokenStorage;
  private autoRefresh: boolean;
  private refreshThreshold: number; // Секунды до истечения для refresh
  private tokenCache = new Map<string, { tokens: OAuth2Tokens; expiresAt: number }>();

  constructor(options: TokenManagerOptions = {}) {
    this.storage = options.storage || new InMemoryTokenStorage();
    this.autoRefresh = options.autoRefresh ?? true;
    this.refreshThreshold = options.refreshThreshold ?? 3600; // 1 час по умолчанию
  }

  /**
   * Сохранить токены
   *
   * @param userId - ID пользователя
   * @param tokens - OAuth2 токены
   */
  async save(userId: string, tokens: OAuth2Tokens): Promise<void> {
    await this.storage.save(userId, tokens);

    // Обновить кэш
    const expiresAt = tokens.receivedAt + tokens.expiresIn * 1000;
    this.tokenCache.set(userId, { tokens, expiresAt });
  }

  /**
   * Получить токены
   *
   * @param userId - ID пользователя
   * @param oauth2Manager - OAuth2Manager для refresh (если включён autoRefresh)
   * @returns Токены или null
   */
  async get(userId: string, oauth2Manager?: OAuth2Manager): Promise<OAuth2Tokens | null> {
    // Проверить кэш
    const cached = this.tokenCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.tokens;
    }

    // Получить из хранилища
    const tokens = await this.storage.get(userId);
    if (!tokens) {
      return null;
    }

    // Проверить необходимость refresh
    if (this.autoRefresh && oauth2Manager && this.shouldRefresh(tokens)) {
      try {
        const refreshedTokens = await this.refreshTokens(tokens, oauth2Manager);
        await this.save(userId, refreshedTokens);
        return refreshedTokens;
      } catch {
        // Вернуть старые токены если refresh не удался
        return tokens;
      }
    }

    return tokens;
  }

  /**
   * Удалить токены
   *
   * @param userId - ID пользователя
   */
  async delete(userId: string): Promise<void> {
    await this.storage.delete(userId);
    this.tokenCache.delete(userId);
  }

  /**
   * Проверить, есть ли токены для пользователя
   *
   * @param userId - ID пользователя
   * @returns true если токены существуют
   */
  async has(userId: string): Promise<boolean> {
    const tokens = await this.storage.get(userId);
    return tokens !== null;
  }

  /**
   * Получить все ID пользователей с токенами
   *
   * @returns Массив ID пользователей
   */
  async getAllUserIds(): Promise<string[]> {
    return await this.storage.getAllUserIds();
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Проверить, нужно ли refreshить токены
   */
  private shouldRefresh(tokens: OAuth2Tokens): boolean {
    if (tokens.expiresIn === 0) {
      return false; // Бессрочный токен
    }

    const now = Date.now();
    const expiresAt = tokens.receivedAt + tokens.expiresIn * 1000;
    const thresholdMs = this.refreshThreshold * 1000;

    return now >= expiresAt - thresholdMs;
  }

  /**
   * Refresh токенов
   */
  private async refreshTokens(
    tokens: OAuth2Tokens,
    _oauth2Manager: OAuth2Manager,
  ): Promise<OAuth2Tokens> {
    // Если есть refresh token, использовать его
    if (tokens.refreshToken) {
      // Instagram Graph API не поддерживает refresh token flow напрямую
      // Нужно заново пройти OAuth2 flow
      throw new Error('Token refresh requires re-authorization');
    }

    // Для Instagram нужно получить новый токен через app
    // Это должно обрабатываться на уровне приложения
    throw new Error('Token expired, re-authorization required');
  }
}

/**
 * Интерфейс для хранилища токенов
 */
export interface TokenStorage {
  save(userId: string, tokens: OAuth2Tokens): Promise<void>;
  get(userId: string): Promise<OAuth2Tokens | null>;
  delete(userId: string): Promise<void>;
  getAllUserIds(): Promise<string[]>;
}

/**
 * Опции TokenManager
 */
export interface TokenManagerOptions {
  /** Хранилище токенов */
  storage?: TokenStorage;
  /** Автоматический refresh */
  autoRefresh?: boolean;
  /** Порог refresh (секунды до истечения) */
  refreshThreshold?: number;
}

/**
 * In-memory хранилище токенов (для тестов)
 */
export class InMemoryTokenStorage implements TokenStorage {
  private store = new Map<string, OAuth2Tokens>();

  async save(userId: string, tokens: OAuth2Tokens): Promise<void> {
    this.store.set(userId, tokens);
  }

  async get(userId: string): Promise<OAuth2Tokens | null> {
    return this.store.get(userId) || null;
  }

  async delete(userId: string): Promise<void> {
    this.store.delete(userId);
  }

  async getAllUserIds(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

/**
 * File-based хранилище токенов
 */
export class FileTokenStorage implements TokenStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(userId: string, tokens: OAuth2Tokens): Promise<void> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const filePath = path.join(this.basePath, `${userId}.token.json`);
    await fs.writeFile(filePath, JSON.stringify(tokens, null, 2));
  }

  async get(userId: string): Promise<OAuth2Tokens | null> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    try {
      const filePath = path.join(this.basePath, `${userId}.token.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as OAuth2Tokens;
    } catch {
      return null;
    }
  }

  async delete(userId: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    try {
      const filePath = path.join(this.basePath, `${userId}.token.json`);
      await fs.unlink(filePath);
    } catch {
      // Файл не существует
    }
  }

  async getAllUserIds(): Promise<string[]> {
    const fs = await import('node:fs/promises');

    try {
      const files = await fs.readdir(this.basePath);
      return files
        .filter((file) => file.endsWith('.token.json'))
        .map((file) => file.replace('.token.json', ''));
    } catch {
      return [];
    }
  }
}

// Import types
import { OAuth2Manager } from './oauth2.js';
import type { OAuth2Tokens } from './oauth2-config.js';
