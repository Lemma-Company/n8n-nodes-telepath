import { NodeApiError, type INode, type IHttpRequestOptions, type IDataObject } from 'n8n-workflow';
import type { Operation } from './catalog';

export const API_URL = 'https://telepath.lemma.company/api/v1';
export interface HttpFailure { status: number; code: string; retryAfter?: number; }
export function failureOf(error: unknown, now = Date.now()): HttpFailure {
  // n8n's authenticated helper wraps HTTP failures in NodeApiError.
  // The original response (including Retry-After) lives in errorResponse.
  let rawError: unknown = error;
  for (let depth = 0; depth < 3; depth++) {
    if (!rawError || typeof rawError !== 'object' || !('errorResponse' in rawError) || !rawError.errorResponse || typeof rawError.errorResponse !== 'object') break;
    rawError = rawError.errorResponse;
  }
  const e = (rawError ?? {}) as {statusCode?: number; httpCode?: string; response?: {status?: number; statusCode?: number; headers?: Record<string, unknown>; data?: unknown; body?: unknown}; error?: unknown};
  const status = Number(e.statusCode ?? e.httpCode ?? e.response?.status ?? e.response?.statusCode ?? 0);
  let body = e.response?.data ?? e.response?.body ?? e.error;
  if (typeof body === 'string') {try {body = JSON.parse(body);} catch {body = {};}}
  const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
  const raw = e.response?.headers?.['retry-after'] ?? e.response?.headers?.['Retry-After'];
  let seconds: number | undefined;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const n = Number(raw);
    seconds = Number.isFinite(n) ? (n >= 0 ? n : undefined) : Math.max(0, (Date.parse(String(raw)) - now) / 1000);
    if (seconds !== undefined && !Number.isFinite(seconds)) seconds = undefined;
  }
  return {status, code, retryAfter: seconds};
}
function message(f: HttpFailure, write: boolean): string {
  if (f.status === 401) return 'Reconnect your Telepath credential. The sign-in expired or was revoked.';
  if (f.status === 403) return 'Telepath denied this action. Check your account permissions, plan and remaining allowance in @lemma_telepath_bot.';
  if (f.status === 404) return 'This item or API operation is unavailable in your Telepath account. Check its ID and connection.';
  if (f.status === 400 || f.status === 415) return 'Telepath rejected the parameters. Check required fields, IDs, dates and media sources.';
  if (f.status === 429) return `Rate limit reached. Wait${f.retryAfter !== undefined ? ` at least ${Math.ceil(f.retryAfter)} seconds` : ' before trying again'}. ${write ? 'No automatic action retry was performed.' : 'Reduce your workflow frequency.'}`;
  return write ? 'Could not confirm the action. It may have succeeded. Check the destination before retrying; do not automatically resend.' : 'Could not read Telepath. Try again later or contact https://telepath.lemma.company/support.';
}

export async function requestOperation(
  op: Operation, args: Record<string, unknown>,
  request: (options: IHttpRequestOptions) => Promise<unknown>,
  wait: (ms: number) => Promise<void>, node: INode,
): Promise<IDataObject> {
  const payload = {...args};
  let path = op.path;
  if (path.includes('{chat_id}')) {path = path.replace('{chat_id}', encodeURIComponent(String(payload.chat_id))); delete payload.chat_id;}
  const options: IHttpRequestOptions = {method: op.method, url: API_URL + path, json: true, timeout: 30000,
    headers: {'Accept': 'application/json', ...(op.method === 'POST' ? {'Content-Type': 'application/json'} : {})},
    // n8n's Axios adapter drops empty object bodies. Serialize explicitly so
    // optional-only operations still send a JSON object when no fields are set.
    ...(op.method === 'GET' ? {qs: payload as IDataObject} : {body: JSON.stringify(payload)})};
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await request(options);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new NodeApiError(node, {}, {message: 'Unexpected Telepath response.'});
      return result as IDataObject;
    } catch (error) {
      const failure = failureOf(error);
      // Only retry reads or our server's explicit pre-dispatch quota rejection.
      // Telegram 429 and ambiguous failures on writes are never resent.
      const safe = !op.write || failure.code === 'rate_limited';
      const delay = failure.retryAfter ?? 60;
      if (failure.status === 429 && safe && attempt < 2 && delay <= 60) {await wait(Math.max(1000, Math.ceil(delay * 1000))); continue;}
      const safeMessage = message(failure, op.write);
      throw new NodeApiError(node, {}, {message: safeMessage, httpCode: String(failure.status)});
    }
  }
}
