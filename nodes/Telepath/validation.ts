import { NodeOperationError, type INode } from 'n8n-workflow';
import type { Schema, Operation } from './catalog';

// Validate a fixed, bundled schema. No schema downloads or runtime dependencies.
export function validate(value: unknown, schema: Schema, path: string): void {
  const bad = () => { throw new Error(`Invalid ${path}. Check the field type, format and allowed range.`); };
  if (schema.anyOf) {
    for (const variant of schema.anyOf) { try {validate(value, variant, path); return;} catch { /* Try the next allowed variant. */ } }
    bad();
  }
  if (schema.const !== undefined && value !== schema.const) bad();
  if (schema.enum && !schema.enum.includes(value)) bad();
  if (schema.type === 'null' && value !== null) bad();
  if (schema.type === 'boolean' && typeof value !== 'boolean') bad();
  if (schema.type === 'string') {
    if (typeof value !== 'string') return bad();
    if (schema.minLength !== undefined && value.length < schema.minLength) bad();
    if (schema.maxLength !== undefined && value.length > schema.maxLength) bad();
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) bad();
    if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) bad();
    if (schema.format === 'uri') { try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) bad(); } catch {bad();} }
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isSafeInteger(value))) return bad();
    if (schema.minimum !== undefined && value < schema.minimum) bad();
    if (schema.maximum !== undefined && value > schema.maximum) bad();
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) bad();
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) bad();
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return bad();
    if (schema.minItems !== undefined && value.length < schema.minItems) bad();
    if (schema.maxItems !== undefined && value.length > schema.maxItems) bad();
    if (schema.items) value.forEach(v => validate(v, schema.items!, path + ' item'));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) throw new Error(`Missing ${path}.${key}.`);
    for (const key of Object.keys(record)) {
      const child = schema.properties?.[key];
      if (child) validate(record[key], child, path + '.' + key);
      else if (schema.additionalProperties === false) bad();
    }
  }
}

export function argumentsFor(op: Operation, get: (name: string) => unknown, optional: Record<string, unknown>, node: INode): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of op.fields) {
    if (!field.required && !Object.prototype.hasOwnProperty.call(optional, field.name)) continue;
    let value = field.required ? get(field.name) : optional[field.name];
    if (field.ui.type === 'json' && typeof value === 'string') {
      try {value = JSON.parse(value);} catch {throw new NodeOperationError(node, `Invalid JSON in ${field.ui.displayName}.`);}
    }
    args[field.apiName] = value;
  }
  validate(args, op.schema, 'parameters');
  for (const key of ['chat_id', 'from_chat_id']) if (args[key] === 0) throw new Error(`${key} must be a non-zero chat ID.`);
  if (['kb_get_note', 'kb_update_note', 'kb_delete_note'].includes(op.tool) && args.id == null && !args.title) throw new Error('Provide the note ID or exact title in Additional Fields.');
  if (op.tool === 'telegram_forget' && args.chat_id == null && args.before == null) throw new Error('Choose a chat or a Before date. Unscoped archive deletion is not allowed.');
  if (op.tool === 'telegram_send_media') {
    const source = args.from_chat_id != null && args.from_message_id != null;
    if (args.url ? args.from_chat_id != null || args.from_message_id != null : !source) throw new Error('Choose exactly one media source: URL, or Source Chat ID and Source Message ID.');
  }
  return args;
}
