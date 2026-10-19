const fs=require('fs'),path=require('path'),{spawn}=require('child_process')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function openBrowser(url,temp){
  const edge=process.env.ARCADIA_TEST_EDGE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  if(!fs.existsSync(edge))throw Error('Edge tidak ditemukan; atur ARCADIA_TEST_EDGE')
  const profile=path.join(temp,'edge'),browser=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1500,1100',url],{windowsHide:true,stdio:'ignore'})
  let socket
  try{
    const file=path.join(profile,'DevToolsActivePort')
    for(let i=0;!fs.existsSync(file)&&i<100;i++)await sleep(100)
    const port=fs.readFileSync(file,'utf8').split('\n')[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json()
    const target=targets.find(t=>t.type==='page'&&t.url.startsWith(url))
    socket=new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
    let sequence=0;const pending=new Map(),errors=[]
    socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
    const waitFor=async expression=>{for(let i=0;i<250;i++){if(await evaluate(expression))return;await sleep(100)}throw Error('Timeout: '+expression+'\n'+await evaluate('document.body.innerText'))}
    await send('Runtime.enable');await send('Page.reload',{ignoreCache:true})
    return {send,evaluate,waitFor,errors,close:async()=>{await send('Browser.close').catch(()=>{});socket.close();browser.kill()}}
  }catch(e){socket?.close();browser.kill();throw e}
}
module.exports={openBrowser,sleep}
