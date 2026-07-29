import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, apiRequestWithMeta, setUnauthorizedHandler } from '../src/services/apiClient';
import { tokenStorage } from '../src/lib/tokenStorage';
import { ApiError } from '../src/lib/apiError';

type FakeFetch = (
  input: RequestInfo | URL,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function installFakeFetch(fake: FakeFetch): () => void {
  const original = global.fetch;
  global.fetch = fake as unknown as typeof fetch;
  return () => {
    global.fetch = original;
  };
}

function beforeEach() {
  tokenStorage.clear();
  setUnauthorizedHandler(undefined);
}

test('apiRequest unwraps the success envelope and returns `data`', async () => {
  beforeEach();
  const restore = installFakeFetch(async () =>
    jsonResponse(200, { success: true, data: { id: '1' } }),
  );
  try {
    const result = await apiRequest<{ id: string }>('movies/1');
    assert.deepEqual(result, { id: '1' });
  } finally {
    restore();
  }
});

test('apiRequestWithMeta returns both data and meta', async () => {
  beforeEach();
  const restore = installFakeFetch(async () =>
    jsonResponse(200, {
      success: true,
      data: [{ id: '1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    }),
  );
  try {
    const result = await apiRequestWithMeta<{ id: string }[]>('movies');
    assert.equal(result.data.length, 1);
    assert.equal(result.meta?.total, 1);
  } finally {
    restore();
  }
});

test('apiRequest throws an ApiError carrying the error envelope', async () => {
  beforeEach();
  const restore = installFakeFetch(async () =>
    jsonResponse(404, { success: false, error: { code: 'NOT_FOUND', message: 'Movie not found' } }),
  );
  try {
    await assert.rejects(
      () => apiRequest('movies/missing'),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, 'NOT_FOUND');
        assert.equal(error.isNotImplemented, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('apiRequest retries once after a silent refresh succeeds on 401', async () => {
  beforeEach();
  tokenStorage.setTokens('expired-access', 'valid-refresh');
  let call = 0;
  const restore = installFakeFetch(async (input) => {
    call += 1;
    const url = String(input);
    if (url.includes('auth/refresh')) {
      return jsonResponse(200, {
        success: true,
        data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      });
    }
    if (call === 1) {
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Expired' },
      });
    }
    return jsonResponse(200, { success: true, data: { id: '1' } });
  });

  try {
    const result = await apiRequest<{ id: string }>('users/me');
    assert.deepEqual(result, { id: '1' });
    assert.equal(tokenStorage.getAccessToken(), 'new-access');
  } finally {
    restore();
  }
});

test('apiRequest clears tokens and signals unauthorized when refresh also fails', async () => {
  beforeEach();
  tokenStorage.setTokens('expired-access', 'expired-refresh');
  let signalledOut = false;
  setUnauthorizedHandler(() => {
    signalledOut = true;
  });

  const restore = installFakeFetch(async (input) => {
    const url = String(input);
    if (url.includes('auth/refresh')) {
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh expired' },
      });
    }
    return jsonResponse(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Expired' },
    });
  });

  try {
    await assert.rejects(() => apiRequest('users/me'));
    assert.equal(signalledOut, true);
    assert.equal(tokenStorage.getAccessToken(), null);
  } finally {
    restore();
    setUnauthorizedHandler(undefined);
  }
});
