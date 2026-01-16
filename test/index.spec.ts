import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Feedback Insights Worker', () => {
	it('GET / returns HTML dashboard', async () => {
		const request = new Request('http://example.com/');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/html');
		const text = await response.text();
		expect(text).toContain('Feedback Insights Dashboard');
	});

	it('POST /feedback stores feedback in D1', async () => {
		const request = new Request('http://example.com/feedback', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ source: 'web', content: 'Test feedback' })
		});
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ success: true });
	});

	it('POST /analyze runs AI and stores summary', async () => {
		const request = new Request('http://example.com/analyze', {
			method: 'POST'
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toHaveProperty('summary');
		expect(data).toHaveProperty('sentiment');
		expect(data).toHaveProperty('themes');
	});

	it('GET /insights returns latest AI result', async () => {
		const request = new Request('http://example.com/insights');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(typeof data).toBe('object');
	});
});
