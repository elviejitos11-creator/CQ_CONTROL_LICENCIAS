const fs=require("fs");
const path=require("path");
const Database=require("better-sqlite3");
const lic=require("./modules/licencias");

const ext=process.argv[2];
const archivos=["manifest.json","loader.js","background.js"];
const ruta=n=>path.join(ext,n);

for(const n of [...archivos,"engine.js"]){
 if(!fs.existsSync(ruta(n)))throw Error("FALTA "+n);
}

const originales=Object.fromEntries(
 archivos.map(n=>[n,fs.readFileSync(ruta(n),"utf8")])
);

const m=JSON.parse(originales["manifest.json"]);

if(m.manifest_version!==3 ||
 m.background?.service_worker!=="background.js" ||
 !originales["loader.js"].includes("LOBO_CARGAR_MOTOR") ||
 !originales["background.js"].includes("LOBO_CARGAR_MOTOR")){
 throw Error("ESTRUCTURA NO COMPATIBLE. SIN CAMBIOS.");
}

const db=new Database("./data/cq_control.db");
const registro=db.prepare(
 "SELECT id,producto_codigo,estado,vence_en FROM licencias WHERE id=1"
).get();

if(!registro||registro.producto_codigo!=="LOBO_PRO_1"||
 String(registro.estado).toUpperCase()!=="ACTIVA"||
 Date.parse(registro.vence_en)<=Date.now()){
 db.close();
 throw Error("LICENCIA 1 NO ESTA ACTIVA O VIGENTE");
}

const clave=lic.generarClave();
const respaldo=path.join(ext,"RESPALDO_CQ_"+Date.now());
fs.mkdirSync(respaldo);

for(const n of archivos){
 fs.copyFileSync(ruta(n),path.join(respaldo,n));
}

const nuevoBackground=originales["background.js"]+`
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.tipo!=="CQ_VERIFICAR_LOBO_1")return;
 (async()=>{
  try{
   const r=await fetch("http://127.0.0.1:7000/api/licencias/verificar",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      clave:${JSON.stringify(clave)},
      producto:"LOBO_PRO_1",
      dispositivo:"EQUIPO_PRUEBA_1"
    })
   });
   const d=await r.json();
   reply({autorizada:r.ok&&d.autorizada===true});
  }catch(e){
   reply({autorizada:false});
  }
 })();
 return true;
});
`;

const nuevoLoader=`
(async()=>{
 try{
  const {loboActivo}=await chrome.storage.local.get({loboActivo:false});
  if(!loboActivo)return;
  const r=await chrome.runtime.sendMessage({tipo:"CQ_VERIFICAR_LOBO_1"});
  if(!r?.autorizada)return;
  chrome.runtime.sendMessage({tipo:"LOBO_CARGAR_MOTOR"});
 }catch(e){console.error("CQ CONTROL",e)}
})();
`;

m.host_permissions=[
 ...new Set([...(m.host_permissions||[]),"http://127.0.0.1:7000/*"])
];

try{
 new (require("vm").Script)(nuevoBackground);
 new (require("vm").Script)(nuevoLoader);

 fs.writeFileSync(ruta("background.js"),nuevoBackground);
 fs.writeFileSync(ruta("loader.js"),nuevoLoader);
 fs.writeFileSync(ruta("manifest.json"),JSON.stringify(m,null,2));

 db.prepare("UPDATE licencias SET clave_hash=?,estado='ACTIVA' WHERE id=1")
   .run(lic.hashClave(clave));

 console.log("CONEXION CQ INSTALADA");
 console.log("BACKGROUND: OK");
 console.log("LOADER: OK");
 console.log("PERMISO 7000: OK");
 console.log("ENGINE.JS: INTACTO");
 console.log("RESPALDO:",respaldo);
}catch(e){
 for(const n of archivos){
  fs.copyFileSync(path.join(respaldo,n),ruta(n));
 }
 throw e;
}finally{db.close()}