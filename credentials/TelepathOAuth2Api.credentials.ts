import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class TelepathOAuth2Api implements ICredentialType {
  name = 'telepathOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Telepath OAuth2 API';
  documentationUrl = 'https://github.com/Lemma-Company/n8n-nodes-telepath#credentials';
  icon = {light: 'file:../nodes/Telepath/telepath.svg', dark: 'file:../nodes/Telepath/telepath.dark.svg'} as const;
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://telepath.lemma.company/api/v1',
      url: '/chats/list',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { limit: 1 },
    },
  };
  properties: INodeProperties[] = [
    { displayName: 'Use Dynamic Client Registration', name: 'useDynamicClientRegistration', type: 'hidden', default: true },
    { displayName: 'Server URL', name: 'serverUrl', type: 'hidden', default: 'https://telepath.lemma.company/mcp' },
    { displayName: 'Resource URL', name: 'resourceUrl', type: 'hidden', default: 'https://telepath.lemma.company/mcp' },
    { displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
    { displayName: 'Scope', name: 'scope', type: 'hidden', default: 'telegram.read telegram.write' },
  ];
}
