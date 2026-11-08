import type { IHttpClient, SessionState } from '@lv24/kernel';

/**
 * Базовый интерфейс для процессоров official API.
 */
export interface IProcessor {
  /**
   * Имя процессора (для логирования)
   */
  readonly name: string;

  /**
   * Установить HTTP клиент.
   */
  setHttpClient(client: IHttpClient): void;

  /**
   * Установить состояние сессии.
   */
  setSessionState(state: SessionState): void;

  /**
   * Получить состояние сессии.
   */
  getSessionState(): SessionState | null;
}

/**
 * Минимальный базовый класс для процессоров official API.
 *
 * Только http + session state; без private-API helpers
 * (HeaderBuilder, cookies, device) — они остаются приватными.
 */
export abstract class BaseProcessor implements IProcessor {
  /** HTTP клиент */
  protected http: IHttpClient | null = null;

  /** Состояние сессии */
  protected sessionState: SessionState | null = null;

  /**
   * Имя процессора (для логирования)
   */
  abstract readonly name: string;

  /**
   * Установить HTTP клиент.
   */
  setHttpClient(client: IHttpClient): void {
    this.http = client;
  }

  /**
   * Установить состояние сессии.
   */
  setSessionState(state: SessionState): void {
    this.sessionState = state;
  }

  /**
   * Получить состояние сессии.
   */
  getSessionState(): SessionState | null {
    return this.sessionState;
  }
}
