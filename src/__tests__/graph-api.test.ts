import { describe, it, expect, vi } from 'vitest';
import type { IHttpClient, HttpResponse } from '@lv24/kernel';
import { ResponseType, createMinimalSessionState } from '@lv24/kernel';
import { GraphApiProcessor } from '../graph-api.js';

function mockResponse(body: unknown, statusCode = 200): HttpResponse {
  return {
    statusCode,
    headers: {},
    body,
    rawBody: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function processorWith(body: unknown, statusCode = 200, token: string | null = 'graph-token') {
  const send = vi.fn().mockResolvedValue(mockResponse(body, statusCode));
  const http: IHttpClient = { send, setProxy: vi.fn() };
  const processor = new GraphApiProcessor();
  processor.setHttpClient(http);
  processor.setSessionState(
    token === null
      ? createMinimalSessionState('user1')
      : createMinimalSessionState('user1', token),
  );
  return { processor, send };
}

const mediaItem = {
  taken_at: 1700000000,
  pk: '123',
  id: '123_456',
  media_type: 1,
  caption: null,
};

describe('GraphApiProcessor', () => {
  it('fails fast without an HTTP client', async () => {
    const processor = new GraphApiProcessor();
    processor.setSessionState(createMinimalSessionState('user1', 'tok'));

    const result = await processor.getUser();

    expect(result.succeeded).toBe(false);
    expect(result.info.responseType).toBe(ResponseType.NetworkError);
  });

  it('fails fast without a Graph API token', async () => {
    const { processor, send } = processorWith({ status: 'ok' }, 200, null);

    const result = await processor.getUser();

    expect(result.succeeded).toBe(false);
    expect(result.info.responseType).toBe(ResponseType.LoginRequired);
    expect(send).not.toHaveBeenCalled();
  });

  it('maps 401 to LoginRequired', async () => {
    const { processor } = processorWith({}, 401);

    const result = await processor.getUser();

    expect(result.succeeded).toBe(false);
    expect(result.info.responseType).toBe(ResponseType.LoginRequired);
  });

  it('returns the profile payload on success', async () => {
    const profile = { status: 'ok', id: '1784141', username: 'testuser' };
    const { processor, send } = processorWith(profile);

    const result = await processor.getUser();

    expect(result.succeeded).toBe(true);
    expect(result.value).toEqual(profile);
    const url = send.mock.calls[0][0].url as string;
    expect(url).toContain('https://graph.instagram.com/v18.0/me');
  });

  it('extracts user media items', async () => {
    const { processor } = processorWith({ status: 'ok', data: [mediaItem] });

    const result = await processor.getUserMedia('me', 10);

    expect(result.succeeded).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(result.value[0].id).toBe('123_456');
  });

  it('extracts a single media item', async () => {
    const { processor } = processorWith({ status: 'ok', ...mediaItem });

    const result = await processor.getMedia('123_456');

    expect(result.succeeded).toBe(true);
    expect(result.value.id).toBe('123_456');
  });

  it('creates and publishes a media container', async () => {
    const { processor: creator } = processorWith({ status: 'ok', id: 'container1' });
    const created = await creator.createMediaContainer('IMAGE', 'https://example.com/a.jpg', 'hi');
    expect(created.succeeded).toBe(true);
    expect(created.value).toBe('container1');

    const { processor: publisher } = processorWith({ status: 'ok', id: 'media1' });
    const published = await publisher.publishContainer('container1');
    expect(published.succeeded).toBe(true);
    expect(published.value).toBe('media1');
  });

  it('parses media insights', async () => {
    const { processor } = processorWith({ status: 'ok', media_id: '123', impressions: 10, reach: 8 });

    const result = await processor.getMediaInsights('123');

    expect(result.succeeded).toBe(true);
    expect(result.value.media_id).toBe('123');
    expect(result.value.impressions).toBe(10);
  });

  it('parses account insights', async () => {
    const { processor } = processorWith({
      status: 'ok',
      data: [
        {
          name: 'impressions',
          period: 'day',
          values: [{ value: 5, end_time: '2024-01-01' }],
          title: 'Impressions',
          description: 'd',
          id: '1',
        },
      ],
    });

    const result = await processor.getInsights(['impressions']);

    expect(result.succeeded).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(result.value[0].name).toBe('impressions');
  });

  it('exchanges a short-lived token for a long-lived one', async () => {
    const { processor, send } = processorWith({ status: 'ok', access_token: 'long-token' });

    const result = await processor.refreshAccessToken('short-token', 'app-secret');

    expect(result.succeeded).toBe(true);
    expect(result.value).toBe('long-token');
    const query = send.mock.calls[0][0].query as Record<string, string>;
    expect(query.grant_type).toBe('ig_exchange_token');
    expect(query.client_secret).toBe('app-secret');
  });

  it('maps transport errors to NetworkError results', async () => {
    const send = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const http: IHttpClient = { send, setProxy: vi.fn() };
    const processor = new GraphApiProcessor();
    processor.setHttpClient(http);
    processor.setSessionState(createMinimalSessionState('user1', 'tok'));

    const result = await processor.getUser();

    expect(result.succeeded).toBe(false);
    expect(result.info.responseType).toBe(ResponseType.NetworkError);
  });
});
