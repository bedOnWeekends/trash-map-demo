import {projectUrl,tokenHash} from './deployment.ts';
const allowed=new Set(['booth_snapshot','booth_login_attempt','booth_mutate']);
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response(null,{status:405});
 const url=Deno.env.get('SUPABASE_URL');
 const configured=Deno.env.get('BOOTH_RPC_TOKEN_SHA256')??(url===projectUrl?tokenHash:undefined);
 const auth=req.headers.get('authorization')??'';
 if(!url||!configured||!/^Bearer [a-f0-9]{64}$/.test(auth))return new Response(null,{status:401});
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.slice(7)));
 const digest=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==configured)return new Response(null,{status:401});
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!service)return new Response(null,{status:503});
 try{
  const body=await req.text();if(body.length>514000)return new Response(null,{status:413});
  const {name,args}=JSON.parse(body);if(!allowed.has(name)||!args||Array.isArray(args)||typeof args!=='object')return new Response(null,{status:400});
  const result=await fetch(new URL('/rest/v1/rpc/'+name,url),{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:'Bearer '+service},body:JSON.stringify(args)});
  return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return new Response(null,{status:400})}
});
