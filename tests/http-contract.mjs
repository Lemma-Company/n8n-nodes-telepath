import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const [runtime,backend]=process.argv.slice(2);
assert.ok(runtime && backend,'Usage: node tests/http-contract.mjs /path/to/n8n-runtime /path/to/telepath-backend');
const {httpRequest}=require(resolve(runtime,'node_modules/@n8n/backend-network/dist/http/axios/request.js'));
const {Telepath}=require('../dist/nodes/Telepath/Telepath.node');
const {operations}=require('../dist/nodes/Telepath/catalog');
const {REST_OPERATIONS}=await import(pathToFileURL(resolve(backend,'dist/rest-catalog.js')).href);
const node={id:'audit',name:'Telepath',type:'n8n-nodes-telepath.telepath',typeVersion:1,position:[0,0],parameters:{}};
let expected,checks=0;
const server=http.createServer(async(req,res)=>{
 try {
 let raw='';for await(const b of req)raw+=b;
 const url=new URL(req.url,'http://localhost');
 assert.equal(req.method,expected.op.method);
 assert.equal(url.pathname,'/api/v1'+expected.op.path.replace('{chat_id}',String(expected.payload.chat_id)));
 let payload;
 if(req.method==='POST'){
  assert.match(req.headers['content-type'],/^application\/json/);
  payload=JSON.parse(raw);assert.deepEqual(payload,expected.payload);
  const route=REST_OPERATIONS.find(o=>o.tool===expected.op.tool);
  if(route){assert.equal(route.path,expected.op.path);assert.equal(route.write,expected.op.write);const valid=route.schema.safeParse(payload);assert.ok(valid.success,JSON.stringify(valid.error?.issues));}
  else {assert.equal(expected.op.tool,'telegram_send_message');assert.equal(typeof payload.text,'string');assert.ok(!('chat_id' in payload));}
 }else{
  assert.equal(raw,'');payload=Object.fromEntries(url.searchParams);
  for(const [k,v] of Object.entries(expected.payload)){if(k==='chat_id'&&expected.op.path.includes('{chat_id}'))continue;assert.equal(payload[k],String(v));}
 }
 checks++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'contract_failure',error_description:e.message}));console.error(expected.op.tool,e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
function sample(s,k){
 if(s.const!==undefined)return s.const;if(s.enum)return s.enum[0];if(s.anyOf)return sample(s.anyOf.find(v=>v.type!=='null'),k);
 if(s.type==='integer'||s.type==='number')return k.includes('chat_id')||k==='channel_id'?-123:Math.max(1,s.minimum??1);
 if(s.type==='boolean')return false;
 if(s.type==='array')return Array.from({length:Math.max(1,s.minItems??1)},()=>sample(s.items,'item'));
 if(s.type==='object')return Object.fromEntries(Object.entries(s.properties||{}).map(([key,value])=>[key,sample(value,key)]));
 if(s.format==='date-time')return '2050-01-01T12:00:00Z';if(s.format==='uri'||k==='url')return 'https://example.com/test.png';
 if(k==='timezone')return 'UTC';if(k==='request_id')return 'test-action-123';return 'test';
}
try{
 for(const op of operations){
  for(const mode of ['minimal','all_fields']){
   const selected={};for(const f of op.fields)if(f.required||mode==='all_fields')selected[f.apiName]=sample(f.schema,f.apiName);
   if(['kb_get_note','kb_update_note','kb_delete_note'].includes(op.tool))selected.id=1;
   if(op.tool==='telegram_forget')selected.chat_id=-123;
   if(op.tool==='telegram_send_media'){selected.url='https://example.com/test.png';delete selected.from_chat_id;delete selected.from_message_id;}
   if(['telegram_create_post','telegram_edit_post'].includes(op.tool)){selected.text='Test post';delete selected.album;}
   const params={resource:op.resource,operation:op.tool,authorizeAction:true,additionalFields:{},options:{}};
   for(const f of op.fields)if(Object.hasOwn(selected,f.apiName)){
    const v=f.ui.type==='json'?JSON.stringify(selected[f.apiName]):selected[f.apiName];
    if(f.required)params[f.name]=v;else params.additionalFields[f.name]=v;
   }
   expected={op,payload:{...selected}};
   if(op.path.includes('{chat_id}')&&op.method==='POST')delete expected.payload.chat_id;
   // Preserve the route ID independently of the JSON body.
   if(op.tool==='telegram_send_message')expected.op={...op,path:op.path.replace('{chat_id}',String(selected.chat_id))};
   const ctx={getInputData:()=>[{json:{}}],getNode:()=>node,getNodeParameter:(k,i,f)=>Object.hasOwn(params,k)?params[k]:f,continueOnFail:()=>false,helpers:{httpRequestWithAuthentication:async function(name,options){assert.equal(name,'telepathOAuth2Api');const url=new URL(options.url);return httpRequest({...options,url:`http://127.0.0.1:${server.address().port}${url.pathname}`});}}};
   const result=await Telepath.prototype.execute.call(ctx);assert.equal(result[0][0].json.ok,true);
  }
  console.log('PASS',op.tool,'minimal + all fields');
 }
 console.log('PASS',checks,'real HTTP requests across',operations.length,'operations; writes stayed on localhost');
}finally{await new Promise(r=>server.close(r));}
