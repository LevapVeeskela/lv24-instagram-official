import { BaseProcessor } from './base-processor.js';
import {
  Result,
  ResponseType,
  type IResult,
  type Media,
  type AccountInsight,
  type MediaInsight,
  MediaExtractor,
  MediaInsightSchema,
  AccountInsightSchema,
} from '@lv24/kernel';

export interface IGraphApiProcessor {
  // User endpoints
  getUser(userId?: string): Promise<IResult<unknown>>;
  getUserMedia(userId?: string, limit?: number): Promise<IResult<Media[]>>;
  getUserStories(userId?: string): Promise<IResult<unknown>>;

  // Media endpoints
  getMedia(mediaId: string): Promise<IResult<Media>>;
  getMediaComments(mediaId: string): Promise<IResult<unknown>>;
  getMediaInsights(mediaId: string): Promise<IResult<MediaInsight>>;

  // Insights endpoints
  getInsights(metrics: string[], since?: string, until?: string): Promise<IResult<AccountInsight[]>>;

  // Hashtag endpoints
  getHashtag(tag: string): Promise<IResult<unknown>>;
  getHashtagTopMedia(tag: string): Promise<IResult<Media[]>>;
  getHashtagRecentMedia(tag: string, limit?: number): Promise<IResult<Media[]>>;

  // Comments endpoints
  getComments(mediaId: string): Promise<IResult<unknown>>;
  replyToComment(commentId: string, message: string): Promise<IResult<unknown>>;
  hideComment(commentId: string): Promise<IResult<boolean>>;
  unhideComment(commentId: string): Promise<IResult<boolean>>;

  // Mentions endpoints
  getMentionedComments(): Promise<IResult<unknown>>;

  // Search endpoints
  search(query: string, type?: 'user' | 'hashtag' | 'place'): Promise<IResult<unknown>>;

  // Container endpoints
  createMediaContainer(mediaType: string, mediaUrl: string, caption?: string): Promise<IResult<string>>;
  publishContainer(containerId: string): Promise<IResult<string>>;

  // Refresh tokens
  refreshAccessToken(shortLivedToken: string, appSecret?: string): Promise<IResult<string>>;
  debugAccessToken(token?: string): Promise<IResult<unknown>>;
}

/**
 * Processor для официального Instagram Graph API.
 *
 * Источник: Instagram Graph API documentation
 * Требуется Business или Creator аккаунт
 */
export class GraphApiProcessor extends BaseProcessor implements IGraphApiProcessor {
  readonly name = 'GraphApiProcessor';

  private getBaseUrl(): string {
    return 'https://graph.instagram.com';
  }

  private getApiVersion(): string {
    return 'v18.0';
  }

  private async getAccessToken(): Promise<string | null> {
    return this.sessionState?.tokens?.graphApiToken || null;
  }

  async getUser(userId?: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const id = userId || 'me';
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${id}`,
        method: 'GET',
        query: {
          access_token: token,
          fields: 'id,username,account_type,name,bio,profile_picture_type,website,followers_count,follows_count,media_count',
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getUserMedia(userId?: string, limit = 25): Promise<IResult<Media[]>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const id = userId || 'me';
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${id}/media`,
        method: 'GET',
        query: {
          access_token: token,
          limit: String(limit),
          fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count',
        },
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse(response.statusCode, body);
      if (!result.succeeded) return Result.fail(result.info.message, result.info.responseType, []);

      const media: Media[] = [];
      const data = (body as Record<string, unknown>).data as unknown[] | undefined;
      if (data) {
        for (const item of data) {
          const mediaResult = MediaExtractor.extract(item);
          if (mediaResult.succeeded) media.push(mediaResult.value);
        }
      }
      return Result.success(media);
    } catch (error) {
      return Result.fromError<Media[]>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getUserStories(userId?: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const id = userId || 'me';
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${id}/stories`,
        method: 'GET',
        query: {
          access_token: token,
          fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username',
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getMedia(mediaId: string): Promise<IResult<Media>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${mediaId}`,
        method: 'GET',
        query: {
          access_token: token,
          fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count',
        },
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse<Media>(response.statusCode, body);
      if (!result.succeeded) return result;
      return MediaExtractor.extract(body);
    } catch (error) {
      return Result.fromError<Media>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getMediaComments(mediaId: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${mediaId}/comments`,
        method: 'GET',
        query: {
          access_token: token,
          fields: 'id,from,message,created_time,like_count,hidden',
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getMediaInsights(mediaId: string): Promise<IResult<MediaInsight>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${mediaId}/insights`,
        method: 'GET',
        query: {
          access_token: token,
          metric: 'impressions,reach,engagement,saved,likes,comments,shares,video_views',
        },
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse<MediaInsight>(response.statusCode, body);
      if (!result.succeeded) return result;
      return Result.success(MediaInsightSchema.parse(body));
    } catch (error) {
      return Result.fromError<MediaInsight>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getInsights(metrics: string[], since?: string, until?: string): Promise<IResult<AccountInsight[]>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const id = 'me';
      const query: Record<string, string> = {
        access_token: token,
        metric: metrics.join(','),
      };
      if (since) query.since = since;
      if (until) query.until = until;

      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${id}/insights`,
        method: 'GET',
        query,
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse(response.statusCode, body);
      if (!result.succeeded) return Result.fail(result.info.message, result.info.responseType, []);

      const insights: AccountInsight[] = [];
      const data = (body as Record<string, unknown>).data as unknown[] | undefined;
      if (data) {
        for (const item of data) {
          const parsed = AccountInsightSchema.safeParse(item);
          if (parsed.success) insights.push(parsed.data);
        }
      }
      return Result.success(insights);
    } catch (error) {
      return Result.fromError<AccountInsight[]>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getHashtag(tag: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/ig_hashtag_search`,
        method: 'GET',
        query: {
          access_token: token,
          q: tag,
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getHashtagTopMedia(_tag: string): Promise<IResult<Media[]>> {
    // Graph API doesn't directly support hashtag top media
    // Use Private API instead
    return Result.fail('Use Private API hashtag processor instead', ResponseType.Unknown, []);
  }

  async getHashtagRecentMedia(_tag: string, _limit = 25): Promise<IResult<Media[]>> {
    // Graph API doesn't directly support hashtag recent media
    // Use Private API instead
    return Result.fail('Use Private API hashtag processor instead', ResponseType.Unknown, []);
  }

  async getComments(mediaId: string): Promise<IResult<unknown>> {
    return this.getMediaComments(mediaId);
  }

  async replyToComment(commentId: string, message: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${commentId}/replies`,
        method: 'POST',
        query: { access_token: token },
        body: new URLSearchParams({ message }),
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async hideComment(commentId: string): Promise<IResult<boolean>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${commentId}`,
        method: 'POST',
        query: { access_token: token, hidden: 'true' },
      });
      const result = Result.fromResponse(response.statusCode, response.body as Record<string, unknown>);
      return result.succeeded ? Result.success(true) : Result.fail(result.info.message, result.info.responseType, false);
    } catch (error) {
      return Result.fromError<boolean>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async unhideComment(commentId: string): Promise<IResult<boolean>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/${commentId}`,
        method: 'POST',
        query: { access_token: token, hidden: 'false' },
      });
      const result = Result.fromResponse(response.statusCode, response.body as Record<string, unknown>);
      return result.succeeded ? Result.success(true) : Result.fail(result.info.message, result.info.responseType, false);
    } catch (error) {
      return Result.fromError<boolean>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async getMentionedComments(): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/me/mentioned_comments`,
        method: 'GET',
        query: {
          access_token: token,
          fields: 'id,from,message,created_time,media',
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async search(query: string, _type: 'user' | 'hashtag' | 'place' = 'user'): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/ig_user_search`,
        method: 'GET',
        query: {
          access_token: token,
          q: query,
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async createMediaContainer(mediaType: string, mediaUrl: string, caption?: string): Promise<IResult<string>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    const videoTypes = new Set(['VIDEO', 'REELS', 'STORIES']);
    if (mediaType === 'CAROUSEL') {
      return Result.fail(
        'CAROUSEL containers require child containers and are not supported yet',
        ResponseType.NotImplemented,
      );
    }
    if (mediaType !== 'IMAGE' && !videoTypes.has(mediaType)) {
      return Result.fail(`Unsupported media type: ${mediaType}`, ResponseType.InvalidInput);
    }

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/me/media`,
        method: 'POST',
        query: { access_token: token },
        body: new URLSearchParams({
          ...(mediaType === 'IMAGE' && { image_url: mediaUrl }),
          ...(videoTypes.has(mediaType) && { video_url: mediaUrl }),
          media_type: mediaType,
          ...(caption && { caption }),
        }),
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse(response.statusCode, body);
      if (!result.succeeded) return Result.fail(result.info.message, result.info.responseType, '');
      return Result.success((body as Record<string, unknown>).id as string);
    } catch (error) {
      return Result.fromError<string>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async publishContainer(containerId: string): Promise<IResult<string>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const token = await this.getAccessToken();
    if (!token) return Result.fail('Graph API access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/${this.getApiVersion()}/me/media_publish`,
        method: 'POST',
        query: { access_token: token, creation_id: containerId },
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse(response.statusCode, body);
      if (!result.succeeded) return Result.fail(result.info.message, result.info.responseType, '');
      return Result.success((body as Record<string, unknown>).id as string);
    } catch (error) {
      return Result.fromError<string>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async refreshAccessToken(shortLivedToken: string, appSecret?: string): Promise<IResult<string>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    try {
      const secret = appSecret ?? process.env.INSTAGRAM_APP_SECRET ?? '';
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/access_token`,
        method: 'GET',
        query: {
          grant_type: 'ig_exchange_token',
          client_secret: secret,
          access_token: shortLivedToken,
        },
      });
      const body = response.body as Record<string, unknown>;
      const result = Result.fromResponse(response.statusCode, body);
      if (!result.succeeded) return Result.fail(result.info.message, result.info.responseType, '');
      return Result.success((body as Record<string, unknown>).access_token as string);
    } catch (error) {
      return Result.fromError<string>(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async debugAccessToken(token?: string): Promise<IResult<unknown>> {
    if (!this.http) return Result.fail('HTTP client not initialized', ResponseType.NetworkError);

    const accessToken = token || (await this.getAccessToken());
    if (!accessToken) return Result.fail('Access token required', ResponseType.LoginRequired);

    try {
      const response = await this.http.send({
        url: `${this.getBaseUrl()}/debug_token`,
        method: 'GET',
        query: {
          input_token: accessToken,
          access_token: accessToken,
        },
      });
      return Result.fromResponse(response.statusCode, response.body as Record<string, unknown>, response.body);
    } catch (error) {
      return Result.fromError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }
}
