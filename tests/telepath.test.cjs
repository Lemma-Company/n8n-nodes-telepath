const {test}=require('node:test');
const assert=require('node:assert/strict');
const {operations,properties}=require('../dist/nodes/Telepath/catalog');
const {argumentsFor}=require('../dist/nodes/Telepath/validation');
const {requestOperation,failureOf}=require('../dist/nodes/Telepath/request');
const {Telepath}=require('../dist/nodes/Telepath/Telepath.node');
const {TelepathOAuth2Api}=require('../dist/credentials/TelepathOAuth2Api.credentials');
const node={id:'test',name:'Telepath',type:'n8n-nodes-telepath.telepath',typeVersion:1,position:[0,0],parameters:{}};
const op=name=>operations.find(o=>o.tool===name);
const quota=(code='rate_limited',after='2')=>({statusCode:429,response:{headers:{'retry-after':after},body:{error:code}}});
const args=(name,required={},optional={})=>argumentsFor(op(name),key=>required[key],optional,node);

test('all 30 operations are explicit, uniquely named and constrained to service routes',()=>{
 assert.equal(operations.length,30);assert.equal(new Set(operations.map(o=>o.tool)).size,30);
 for(const o of operations){assert.match(o.path,/^\/[a-z]/);assert.ok(!o.path.includes('://'));assert.ok(['GET','POST'].includes(o.method));assert.ok(o.schema.properties);}
 assert.ok(op('telegram_get_photos'));assert.ok(op('telegram_bot_dm_reply'));assert.ok(op('telegram_forget'));
 assert.equal(properties.find(p=>p.name==='resource').default,'chat');
});
test('OAuth uses n8n DCR with canonical resource and PKCE, without embedded secrets',()=>{
 const c=new TelepathOAuth2Api(), p=Object.fromEntries(c.properties.map(p=>[p.name,p.default]));
 assert.deepEqual(c.extends,['oAuth2Api']);assert.equal(p.useDynamicClientRegistration,true);assert.equal(p.grantType,'pkce');
 assert.equal(p.serverUrl,'https://telepath.lemma.company/mcp');assert.equal(p.resourceUrl,p.serverUrl);
 assert.equal(p.scope,'telegram.read telegram.write');assert.ok(!('clientSecret'in p));
 assert.equal(c.test.request.method,'POST');assert.equal(c.test.request.url,'/chats/list');
 assert.equal(c.test.request.baseURL,'https://telepath.lemma.company/api/v1');
 assert.deepEqual(c.test.request.body,{limit:1});
});
test('optional booleans and empty text remain intentional; absent fields stay absent',()=>{
 const a=args('kb_update_note',{}, {id:17,body:'',append:false,tags:'[]',reminder:'null'});
 assert.deepEqual(a,{id:17,body:'',tags:[],reminder:null,append:false});
 assert.deepEqual(args('telegram_get_file',{chatId:-17,messageId:4},{includeText:false}),{chat_id:-17,message_id:4,include_text:false});
});
test('validates IDs, scopes, JSON, dates and dangerous broad deletions before sending',()=>{
 assert.throws(()=>args('telegram_get_messages',{chatId:0}),/non-zero/);
 assert.throws(()=>args('telegram_get_messages',{chatId:9007199254740992}),/Invalid/);
 assert.throws(()=>args('telegram_get_photos',{chatId:-1,messageIds:'[1,2,3,4,5,6]'}),/Invalid/);
 assert.throws(()=>args('kb_get_note'),/note ID/);
 assert.throws(()=>args('telegram_forget',{confirmed:true}),/scope|Choose a chat/);
 assert.throws(()=>args('telegram_forget',{confirmed:false},{chatId:-1}),/Invalid/);
 assert.throws(()=>args('create_reminder',{text:'Remember',at:'tomorrow',timezone:'UTC'}),/Invalid/);
 assert.throws(()=>args('kb_create_note',{title:'Hi'},{tags:'secret invalid json'}),e=>!e.message.includes('secret')&&/Invalid JSON/.test(e.message));
 assert.throws(()=>args('telegram_send_media',{chatId:-1},{url:'https://example.com/a',fromChatId:-2,fromMessageId:4}),/exactly one/);
 assert.deepEqual(args('telegram_send_media',{chatId:-1},{fromChatId:-2,fromMessageId:4}),{chat_id:-1,from_chat_id:-2,from_message_id:4});
});
test('GET path and query are separated; body action uses JSON and a fixed origin',async()=>{
 const calls=[];const request=async q=>(calls.push(q),{count:0});
 await requestOperation(op('telegram_get_messages'),{chat_id:-123,limit:20},request,async()=>{},node);
 assert.equal(calls[0].url,'https://telepath.lemma.company/api/v1/chats/-123/messages');assert.deepEqual(calls[0].qs,{limit:20});assert.equal(calls[0].body,undefined);
 await requestOperation(op('kb_create_note'),{title:'Note',body:'x'},request,async()=>{},node);
 assert.deepEqual(JSON.parse(calls[1].body),{title:'Note',body:'x'});assert.equal(calls[1].method,'POST');assert.equal(calls[1].json,true);
 assert.equal(calls[1].headers['Content-Type'],'application/json');
});
test('optional-only POST operations preserve an empty JSON body through HTTP serialization',async()=>{
 for(const name of ['telegram_list_chats','kb_list_notes','list_reminders']) {
  await requestOperation(op(name),{},async options=>{
   assert.equal(typeof options.body,'string');
   assert.equal(options.body,'{}');
   assert.equal(options.headers['Content-Type'],'application/json');
   return {ok:true};
  },async()=>{},node);
 }
});
test('read 429 waits Retry-After and retries at most twice',async()=>{
 let calls=0;const waits=[];
 await assert.rejects(requestOperation(op('telegram_list_chats'),{},async()=>{calls++;throw quota();},async ms=>{waits.push(ms);},node),/Rate limit/);
 assert.equal(calls,3);assert.deepEqual(waits,[2000,2000]);
});
test('Retry-After longer than the wait budget stops without an early retry',async()=>{
 let calls=0;const waits=[];
 await assert.rejects(requestOperation(op('telegram_list_chats'),{},async()=>{calls++;throw quota('rate_limited','300');},async ms=>{waits.push(ms);},node),/300 seconds/);
 assert.equal(calls,1);assert.deepEqual(waits,[]);
 const date=new Date(100000+5000).toUTCString();assert.equal(failureOf(quota('rate_limited',date),100000).retryAfter,5);
 assert.equal(failureOf(quota('rate_limited','-1')).retryAfter,undefined);
 assert.equal(failureOf(quota('rate_limited','invalid')).retryAfter,undefined);
});
test('write retry is permitted only after explicit pre-dispatch rate rejection',async()=>{
 let calls=0;const waits=[];
 const out=await requestOperation(op('telegram_send_message'),{chat_id:-1,text:'x'},async()=>{if(++calls===1)throw quota();return {ok:true};},async ms=>{waits.push(ms);},node);
 assert.equal(out.ok,true);assert.equal(calls,2);assert.deepEqual(waits,[2000]);
 for(const e of [quota('telegram_rate_limited'),{statusCode:502,message:'Authorization: secret'},{code:'ETIMEDOUT',message:'secret'},quota('')]){
  calls=0;await assert.rejects(requestOperation(op('telegram_send_message'),{},async()=>{calls++;throw e;},async()=>{assert.fail('No write retry');},node),e=>!e.message.includes('secret'));
  assert.equal(calls,1);
 }
});
test('401 and 403 do not enter a retry loop',async()=>{
 for(const statusCode of [401,403]){
  let calls=0;await assert.rejects(requestOperation(op('telegram_list_chats'),{},async()=>{calls++;throw {statusCode};},async()=>assert.fail(),node));assert.equal(calls,1);
 }
});
function context(params,request,options={}){
 return {getInputData:()=>options.items??[{json:{}}],getNode:()=>({...node,retryOnFail:options.retryOnFail}),getNodeParameter:(k,i,f)=>Object.hasOwn(params,k)?params[k]:f,continueOnFail:()=>!!options.continueOnFail,helpers:{httpRequestWithAuthentication:async function(name,q){assert.equal(name,'telepathOAuth2Api');return request(q);}}};
}
test('write workflow retry and missing approval are refused before contacting API',async()=>{
 const p={resource:'chat',operation:'telegram_send_message',chatId:-1,text:'x',authorizeAction:true};
 await assert.rejects(Telepath.prototype.execute.call(context(p,()=>assert.fail(),{retryOnFail:true})),/Disable Retry/);
 await assert.rejects(Telepath.prototype.execute.call(context({...p,authorizeAction:false},()=>assert.fail())),/Authorize Action/);
});
test('empty result retains setup guidance; splitting preserves metadata and paired items',async()=>{
 const p={resource:'chat',operation:'telegram_list_chats',options:{splitResults:true}};
 let result={count:0,chats:[],setup_required:{message:'Connect Telegram'}};
 let out=await Telepath.prototype.execute.call(context(p,async()=>result));assert.deepEqual(out[0][0].json,result);
 result={count:2,chats:[{chat_id:1},{chat_id:2}],setup_required:{message:'Limited history'}};
 out=await Telepath.prototype.execute.call(context(p,async()=>result));assert.equal(out[0].length,2);assert.deepEqual(out[0][1].pairedItem,{item:0});assert.equal(out[0][1].json.telepathMeta.setup_required.message,'Limited history');
});
test('continue-on-fail returns a sanitized error on the correct input item',async()=>{
 const p={resource:'chat',operation:'telegram_list_chats'};
 const out=await Telepath.prototype.execute.call(context(p,async()=>{throw {statusCode:401,message:'Bearer SECRET'};},{continueOnFail:true}));
 assert.match(out[0][0].json.error,/Reconnect/);assert.ok(!JSON.stringify(out).includes('SECRET'));assert.deepEqual(out[0][0].pairedItem,{item:0});
});
test('all operations serialize their required fields to the documented REST route',async()=>{
 function sample(s,k){
  if(s.const!==undefined)return s.const;if(s.enum)return s.enum[0];
  if(s.type==='integer'||s.type==='number')return k.includes('chat_id')||k==='channel_id'?-123:Math.max(1,s.minimum??1);
  if(s.type==='boolean')return true;
  if(s.type==='array')return [sample(s.items,'item')];
  if(s.type==='object')return Object.fromEntries((s.required??[]).map(k=>[k,sample(s.properties[k],k)]));
  if(s.format==='date-time')return '2050-01-01T12:00:00Z';
  if(k==='timezone')return 'UTC';if(k==='request_id')return 'test-action-123';return 'test';
 }
 for(const operation of operations){
  const required=Object.fromEntries(operation.fields.filter(f=>f.required).map(f=>[f.name,sample(f.schema,f.apiName)]));
  const optional={};
  if(['kb_get_note','kb_update_note','kb_delete_note'].includes(operation.tool))optional.id=1;
  if(operation.tool==='telegram_forget')optional.chatId=-123;
  if(operation.tool==='telegram_send_media')optional.url='https://example.com/file.png';
  if(['telegram_create_post','telegram_edit_post'].includes(operation.tool))optional.text='Test post';
  const payload=argumentsFor(operation,k=>required[k],optional,node);
  let calls=0;
  await requestOperation(operation,payload,async options=>{
   calls++;assert.ok(options.url.startsWith('https://telepath.lemma.company/api/v1/'));
   assert.equal(options.method,operation.method);
   assert.ok(!options.url.includes('{'));
   assert.equal(options.json,true);return {ok:true};
  },async()=>assert.fail(),node);
  assert.equal(calls,1,operation.tool);
 }
});
test('native n8n NodeApiError wrappers preserve Retry-After and safe rejection classification',async()=>{
 const {NodeApiError}=require('n8n-workflow');
 const wrapped=new NodeApiError(node,{statusCode:429,response:{status:429,headers:{'retry-after':'9'},data:{error:'rate_limited'}}});
 assert.deepEqual(failureOf(wrapped),{status:429,code:'rate_limited',retryAfter:9});
 let calls=0;const waits=[];
 await requestOperation(op('telegram_send_message'),{chat_id:-1,text:'x'},async()=>{if(++calls===1)throw wrapped;return {ok:true};},async ms=>waits.push(ms),node);
 assert.equal(calls,2);assert.deepEqual(waits,[9000]);
});
