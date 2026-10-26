const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const Database=require("better-sqlite3");
const lic=require("./modules/licencias");

const ext=process.argv[2];
const manifestFile=path.join(ext,"manifest.json");
const loaderFile=path.join(ext,"loader.js");
const bgFile=path.join(ext,"background.js");

const original={
  manifest:fs.readFileSync(manifestFile,"utf8"),
  loader:fs.readFileSync(loaderFile,"utf8"),
  background:fs.readFileSync(bgFile,"utf8")
};

const manifest=JSON.parse(original.manifest);

if(manifest.manifest_version!==3 ||
   manifest.background?.service_worker!=="background.js" ||
   !original.loader.includes("LOBO_CARGAR_MOTOR") ||
   !original.loader.includes("loboActivo") ||
   !original.background.includes("LOBO_CARGAR_MOTOR")){
  throw Error("ESTRUCTURA NO COMPATIBLE. NO SE MODIFICO.");
}

const db=new Database("./data/cq_control.db");
const licencia=db.prepare(
  "SELECT id,producto_codigo FROM licencias WHERE id=1"
).get();

if(!licencia || licencia.producto_codigo!=="LOBO_PRO_1"){
  db.close();
  throw Error("LICENCIA 1 NO COINCIDE");
}

const clave=lic.generarClave();
const token=JSON.stringify(clave);

const adicion=`
/* CQ CONTROL - VERIFICACION LOCAL */
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(m?.tipo!=="CQ_VERIFICAR_LOBO_1")return;
 (async()=>{
  try{
   const r=await fetch("http://127.0.0.1:7000/api/licencias/verificar",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     clave:${token},
     producto:"LOBO_PRO_1",
     dispositivo:"CQ_LOBO_1_PRUEBA"
    })
   });
   if(!r.ok)throw Error("HTTP "+r.status);
   const d=await r.json();
   reply({autorizada:d.autorizada===true});
  }catch(e){
   console.error("CQ CONTROL:",e);
   reply({autorizada:false});
  }
 })();
 return true;
});
`;

const nuevoLoader=`(async()=>{
 try{
  const d=await chrome.storage.local.get({loboActivo:false});
  if(!d.loboActivo)return;

  const r=await chrome.runtime.sendMessage({
   tipo:"CQ_VERIFICAR_LOBO_1"
  });

  if(!r?.autorizada){
   console.warn("CQ CONTROL: licencia no autorizada");
   return;
  }

  chrome.runtime.sendMessage({tipo:"LOBO_CARGAR_MOTOR"});
 }catch(e){
  console.error("CQ CONTROL:",e);
 }
})();
`;

manifest.host_permissions=[
 ...new Set([
  ...(manifest.host_permissions||[]),
  "http://127.0.0.1:7000/*"
 ])
];

const respaldo=path.join(ext,"RESPALDO_CQ_"+Date.now());
fs.mkdirSync(respaldo);

for(const f of ["manifest.json","loader.js","background.js"]){
 fs.copyFileSync(path.join(ext,f),path.join(respaldo,f));
}

try{
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
 fs.writeFileSync(loaderFile,nuevoLoader);
 fs.writeFileSync(bgFile,original.background+"\n"+adicion);

 const {execFileSync}=require("child_process");
 execFileSync(process.execPath,["--check",loaderFile]);
 execFileSync(process.execPath,["--check",bgFile]);

 db.prepare(
  "UPDATE licencias SET clave_hash=?,estado='ACTIVA' WHERE id=1"
 ).run(lic.hashClave(clave));

 console.log("LOBO PRO 1 - ARCHIVOS CONECTADOS");
 console.log("LICENCIA ID 1 - CLAVE RENOVADA");
 console.log("MOTOR ORIGINAL INTACTO");
 console.log("RESPALDO:",respaldo);
 console.log("SIGUIENTE: RECARGAR LA EXTENSION EN EL NAVEGADOR");
}catch(e){
 for(const f of ["manifest.json","loader.js","background.js"]){
  fs.copyFileSync(path.join(respaldo,f),path.join(ext,f));
 }
 throw e;
}finally{
 db.close();
}