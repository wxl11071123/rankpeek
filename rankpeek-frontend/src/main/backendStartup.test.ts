import test from 'node:test'
import assert from 'node:assert/strict'

import { BackendIdentityMismatchError, waitForBackend } from './backendStartup.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

test('packaged waitForBackend rejects an existing backend with a different identity', async () => {
  const requestedUrls: string[] = []
  const fetchImpl = async (url: string) => {
    requestedUrls.push(url)
    if (url.endsWith('/actuator/health')) {
      return jsonResponse({ status: 'UP' })
    }
    if (url.endsWith('/api/v1/system/identity')) {
      return jsonResponse({
        data: {
          instanceId: 'external-backend'
        }
      })
    }
    throw new Error(`unexpected url: ${url}`)
  }

  await assert.rejects(
    () => waitForBackend({
      expectedInstanceId: 'spawned-backend',
      fetchImpl,
      maxRetries: 1,
      retryIntervalMs: 0,
      sleep: async () => {}
    }),
    (error) => {
      assert.ok(error instanceof BackendIdentityMismatchError)
      assert.match(error.message, /another RankPeek backend is already running/i)
      return true
    }
  )

  assert.deepEqual(requestedUrls, [
    'http://127.0.0.1:8080/actuator/health',
    'http://127.0.0.1:8080/api/v1/system/identity'
  ])
})

test('packaged waitForBackend accepts the backend spawned for this app launch', async () => {
  const fetchImpl = async (url: string) => {
    if (url.endsWith('/actuator/health')) {
      return jsonResponse({ status: 'UP' })
    }
    if (url.endsWith('/api/v1/system/identity')) {
      return jsonResponse({
        data: {
          instanceId: 'spawned-backend'
        }
      })
    }
    throw new Error(`unexpected url: ${url}`)
  }

  await waitForBackend({
    expectedInstanceId: 'spawned-backend',
    fetchImpl,
    maxRetries: 1,
    retryIntervalMs: 0,
    sleep: async () => {}
  })
})
