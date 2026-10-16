// Profil 3D: aset lokal, konfigurasi per bot, dan traversal guard.
const fs=require('fs');const os=require('os');const path=require('path');const {createProfile3d}=require('../control/profile3d')
let pass=0,fail=0;const ok=(v,m)=>{v?pass++:fail++;console.log((v?'PASS ':'FAIL ')+m)}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arcadia-profile-'));const models=path.join(dir,'models');fs.mkdirSync(models,{recursive:true});fs.writeFileSync(path.join(models,'A model.glb'),Buffer.from([0x67,0x6c,0x54,0x46]));fs.writeFileSync(path.join(models,'abaikan.txt'),'x')
const p=createProfile3d({dataDir:dir});let x=p.publicProfile('BotAlpha');ok(x.models.length===1&&x.models[0]==='A model.glb'&&x.config.model===null,'hanya .glb didaftarkan; default tanpa model')
x=p.update('BotAlpha',{model:'A model.glb',scale:1.25,animationMode:'manual',manualAnimation:'Wave',animationMap:{idle:'Idle'}});ok(x.model==='A model.glb'&&x.scale===1.25&&x.animationMap.idle==='Idle','kalibrasi model/scale/animasi tersimpan')
x=p.publicProfile('BotAlpha');ok(/A%20model.glb$/.test(x.modelUrl)&&x.states.includes('working'),'URL model di-encode dan state otomatis tersedia')
const f=p.resolveModel('A model.glb');ok(f.size===4&&f.full.startsWith(fs.realpathSync(models)),'model sah diselesaikan di dalam data/models')
for(const bad of ['../x.glb','x.txt','xXglb','C:\\x.glb']){let e;try{p.resolveModel(bad)}catch(x){e=x}ok(e&&e.status>=400,'path/ekstensi ditolak: '+bad)}
let e;try{p.update('BotAlpha',{model:'missing.glb'})}catch(x){e=x}ok(e&&e.status===400,'model yang tidak ada ditolak')
try{fs.symlinkSync(path.join(dir,'outside.glb'),path.join(models,'link.glb'));fs.writeFileSync(path.join(dir,'outside.glb'),'x');let z;try{p.resolveModel('link.glb')}catch(x){z=x}ok(z&&z.status===404,'symlink keluar folder ditolak')}catch(e){console.log('SKIP symlink: '+e.message)}
console.log('HASIL: '+pass+' lulus, '+fail+' gagal');process.exit(fail?1:0)
