import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IDataObject } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, NodeApiError, sleep } from 'n8n-workflow';
import { operations, properties } from './catalog';
import { argumentsFor } from './validation';
import { requestOperation } from './request';

export class Telepath implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Telepath', name: 'telepath', icon: {light: 'file:telepath.svg', dark: 'file:telepath.dark.svg'}, group: ['transform'], version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Search your Telegram archive and work with messages, media, Notes, reminders and channels',
    defaults: {name: 'Telepath'}, inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    usableAsTool: true, credentials: [{name: 'telepathOAuth2Api', required: true}], properties,
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    const items = this.getInputData();
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const tool = this.getNodeParameter('operation', itemIndex) as string;
        const op = operations.find(o => o.tool === tool && o.resource === resource);
        if (!op) throw new NodeOperationError(this.getNode(), 'Select a supported Telepath resource and operation.');
        if (op.write && this.getNode().retryOnFail) throw new NodeOperationError(this.getNode(), 'Disable Retry On Fail for write operations. Replaying a completed batch can duplicate actions.');
        if (op.write && this.getNodeParameter('authorizeAction', itemIndex, false) !== true) throw new NodeOperationError(this.getNode(), 'Enable Authorize Action only after checking the action and targets.');
        const settings = this.getNodeParameter('options', itemIndex, {}) as {requestInterval?: number; splitResults?: boolean};
        const interval = Math.max(1000, Math.min(60000, Number(settings.requestInterval) || 1000));
        if (itemIndex > 0) await sleep(interval);
        const optional = this.getNodeParameter('additionalFields', itemIndex, {}) as Record<string, unknown>;
        const args = argumentsFor(op, name => this.getNodeParameter(name, itemIndex), optional, this.getNode());
        const result = await requestOperation(op, args,
          options => this.helpers.httpRequestWithAuthentication.call(this, 'telepathOAuth2Api', options), sleep, this.getNode());
        const key = ['chats', 'messages', 'notes', 'reminders', 'photos'].find(k => Array.isArray(result[k]));
        if (settings.splitResults && key && (result[key] as IDataObject[]).length) {
          const { [key]: rows, ...meta } = result;
          for (const row of rows as IDataObject[]) output.push({json: {...row, telepathMeta: meta}, pairedItem: {item: itemIndex}});
        } else output.push({json: result, pairedItem: {item: itemIndex}});
      } catch (error) {
        const safe = error instanceof Error ? error.message : 'Telepath operation failed.';
        if (this.continueOnFail()) {output.push({json: {error: safe}, pairedItem: {item: itemIndex}}); continue;}
        if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), {}, {message: safe, httpCode: error.httpCode ?? undefined, itemIndex});
        throw new NodeOperationError(this.getNode(), safe, {itemIndex});
      }
    }
    return [output];
  }
}
