import type { INodeProperties } from 'n8n-workflow';
import data from './catalog.json';

export interface Schema {
  type?: string; properties?: Record<string, Schema>; required?: string[];
  items?: Schema; anyOf?: Schema[]; enum?: unknown[]; const?: unknown;
  minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number;
  minLength?: number; maxLength?: number; minItems?: number; maxItems?: number;
  pattern?: string; format?: string; additionalProperties?: boolean;
}
export interface Operation {
  tool: string; resource: string; path: string; method: 'GET' | 'POST';
  summary: string; description: string; write: boolean; schema: Schema;
  fields: Array<{apiName: string; name: string; schema: Schema; required: boolean; ui: INodeProperties}>;
}
export const operations = data as unknown as Operation[];
const names: Record<string, string> = {archive: 'Archive', botInbox: 'Bot Inbox', channel: 'Channel', chat: 'Chat', media: 'Media', note: 'Note', reminder: 'Reminder'};
const defaults: Record<string, string> = {archive: 'telegram_forget', botInbox: 'telegram_bot_direct_messages', channel: 'telegram_create_post', chat: 'telegram_list_chats', media: 'telegram_get_file', note: 'kb_list_notes', reminder: 'list_reminders'};

export const properties: INodeProperties[] = [
  { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true,
    options: Object.entries(names).map(([value, name]) => ({name, value})), default: 'chat' },
];
for (const resource of Object.keys(names)) {
  const group = operations.filter(o => o.resource === resource).sort((a,b) => a.summary.localeCompare(b.summary));
  properties.push({displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
    displayOptions: {show: {resource: [resource]}},
    options: group.map(o => ({name: o.summary, value: o.tool, action: o.summary, description: o.description})),
    default: ''});
  properties[properties.length - 1].default = defaults[resource];
  for (const op of group) {
    const displayOptions = {show: {resource: [resource], operation: [op.tool]}};
    properties.push({displayName: op.description, name: 'operationNotice', type: 'notice', default: '', displayOptions});
    for (const field of op.fields.filter(f => f.required)) properties.push({...field.ui, displayOptions});
    const optional = op.fields.filter(f => !f.required).map(f => f.ui).sort((a,b) => a.displayName.localeCompare(b.displayName));
    if (optional.length) properties.push({displayName: 'Additional Fields', name: 'additionalFields', type: 'collection', placeholder: 'Add Field', default: {}, displayOptions, options: optional});
    if (op.write) properties.push({displayName: 'Authorize Action', name: 'authorizeAction', type: 'boolean', default: false, displayOptions,
      description: 'Whether you authorize this workflow to perform the selected action on the specified targets. Disable Retry On Fail for write operations.'});
  }
}
properties.push({displayName: 'Options', name: 'options', type: 'collection', placeholder: 'Add Option', default: {}, options: [
  {displayName: 'Request Interval (Ms)', name: 'requestInterval', type: 'number', default: 1000, typeOptions: {minValue: 1000, maxValue: 60000, numberPrecision: 0}, description: 'Minimum pause between requests in this execution. Other workflows share the server account limit.'},
  {displayName: 'Split Results', name: 'splitResults', type: 'boolean', default: false, description: 'Whether to emit each chat, message, note, reminder or photo as its own item. Empty responses and setup guidance are preserved.'},
]});
