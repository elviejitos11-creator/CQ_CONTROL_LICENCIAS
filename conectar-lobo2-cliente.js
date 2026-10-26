"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const [uno,dos]=process.argv.slice(2);
const panel=process.cwd();
const ruta=(d,n)=>path.join(d,n);
const leer=(d,n)=>fs.readFileSync(ruta(d,n),"utf8");

for(const n of ["manifest.json","background.js","loader.js","popup.html","engine.js"]){
 if(!fs.existsSync(ruta(dos,n)))throw Error("FALTA EN LOBO 2: "+n);
}
for(const n of ["loader.js","cq-activar.html","cq-activar.js"]){
 if(!fs.existsSync(ruta(uno,n)))throw Error("FALTA EN LOBO 1: "+n);
}
for(const n of ["server.js","modules/activacion-individual.js"]){
 if(!fs.existsSync(ruta(panel,n)))throw Error("FALTA EN PANEL: "+n);
}

const manifest=JSON.parse(leer(dos,"manifest.json").replace(/^\uFEFF/,""));
const background=leer(dos,"background.js");
const loader=leer(dos,"loader.js");
const popup=leer(dos,"popup.html");
const server=leer(panel,"server.js");

if(manifest.manifest_version!==3 ||
 manifest.background?.service_worker!=="background.js" ||
 !background.includes("LOBO_CARGAR_MOTOR") ||
 !loader.includes("LOBO_CARGAR_MOTOR") ||
 !popup.match(/<\/body\s*>/i)){
 throw Error("ESTRUCTURA DE LOBO 2 INESPERADA. SIN CAMBIOS.");
}

if(background.includes("CQ_VERIFICAR_LOBO_2") ||
 loader.includes("CQ_VERIFICAR_LOBO_2")){
 throw Error("LOBO 2 YA TIENE UNA INTEGRACION. SIN CAMBIOS.");
}

const marca="const requiereAdmin=configurarAcceso(app,db);";
if(!server.includes(marca))throw Error("AUTENTICACION NO ENCONTRADA");

const originalModulo=leer(panel,"modules/activacion-individual.js");
if(!originalModulo.includes("activar-instalacion") ||
 !originalModulo.includes("LOBO_PRO_1")){
 throw Error("MODULO DE ACTIVACION INESPERADO");
}

const moduloDos=originalModulo
 .replaceAll("LOBO_PRO_1","LOBO_PRO_2")
 .replaceAll(
  "/api/licencias/activar-instalacion",
  "/api/licencias/activar-instalacion-2"
 );

const conexion='require("./modules/activacion-lobo2")(app,db);';
const nuevoServer=server.includes(conexion)
 ? server
 : server.replace(marca,marca+conexion);

const nuevoLoader=leer(uno,"loader.js")
 .replaceAll("CQ_VERIFICAR_LOBO_1","CQ_VERIFICAR_LOBO_2");

if(!nuevoLoader.includes("LOBO_CARGAR_MOTOR") ||
 !nuevoLoader.includes("CQ_VERIFICAR_LOBO_2")){
 throw Error("LOADER DE REFERENCIA INESPERADO");
}

const listener=`
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.tipo!=="CQ_VERIFICAR_LOBO_2" &&
    msg?.tipo!=="CQ_ACTIVAR_LOBO_2")return;

 (async()=>{
  try{
   if(msg.tipo==="CQ_ACTIVAR_LOBO_2"){
    const clave=String(msg.clave||"").trim();
    const datos=await chrome.storage.local.get(["cqDispositivo"]);
    const dispositivo=datos.cqDispositivo||crypto.randomUUID();

    const r=await fetch("http://127.0.0.1:7000/api/licencias/activar-instalacion-2",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      clave,
      producto:"LOBO_PRO_2",
      dispositivo
     })
    });

    const d=await r.json();

    if(!r.ok||!d.autorizada){
     reply({autorizada:false,motivo:d.motivo||"rechazada"});
     return;
    }

    await chrome.storage.local.set({
     cqClave:clave,
     cqDispositivo:dispositivo,
     cqCliente:d.cliente
    });

    reply({
     autorizada:true,
     cliente:d.cliente,
     vence_en:d.vence_en
    });
    return;
   }

   const v=await chrome.storage.local.get(["cqClave","cqDispositivo"]);

   if(!v.cqClave||!v.cqDispositivo){
    reply({autorizada:false,motivo:"sin_activar"});
    return;
   }

   const r=await fetch("http://127.0.0.1:7000/api/licencias/verificar",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     clave:v.cqClave,
     producto:"LOBO_PRO_2",
     dispositivo:v.cqDispositivo
    })
   });

   const d=await r.json();
   reply({
    autorizada:r.ok&&d.autorizada===true,
    motivo:d.motivo||null
   });

  }catch(e){
   reply({autorizada:false,motivo:"servidor_no_disponible"});
  }
 })();

 return true;
});
`;

const nuevoBackground=background+"\n"+listener;

const html=leer(uno,"cq-activar.html")
 .replaceAll("LOBO PRO 1","LOBO PRO 2");

const activarJS=leer(uno,"cq-activar.js")
 .replaceAll("CQ_ACTIVAR_LOBO_1","CQ_ACTIVAR_LOBO_2");

const enlace='<div style="margin:12px;text-align:center"><a href="cq-activar.html" target="_blank" style="color:white;background:#7445ee;padding:12px;border-radius:8px;display:inline-block;text-decoration:none">ACTIVAR LICENCIA / VER CLIENTE</a></div>';

const nuevoPopup=popup.replace(/<\/body\s*>/i,enlace+"\n</body>");

manifest.host_permissions=[
 ...new Set([
  ...(manifest.host_permissions||[]),
  "http://127.0.0.1:7000/*"
 ])
];

for(const [nombre,contenido] of [
 ["server.js",nuevoServer],
 ["activacion-lobo2.js",moduloDos],
 ["background.js",nuevoBackground],
 ["loader.js",nuevoLoader],
 ["cq-activar.js",activarJS]
]){
 new vm.Script(contenido,{filename:nombre});
}

const respaldo=ruta(panel,"RESPALDO_LOBO2_"+Date.now());
fs.mkdirSync(respaldo);

const cambios=[
 [panel,"server.js",nuevoServer],
 [panel,"modules/activacion-lobo2.js",moduloDos],
 [dos,"manifest.json",JSON.stringify(manifest,null,2)],
 [dos,"background.js",nuevoBackground],
 [dos,"loader.js",nuevoLoader],
 [dos,"popup.html",nuevoPopup],
 [dos,"cq-activar.html",html],
 [dos,"cq-activar.js",activarJS]
];

const motorAntes=fs.readFileSync(ruta(dos,"engine.js"));
const anteriores=[];

try{
 for(const [carpeta,nombre,contenido] of cambios){
  const destino=ruta(carpeta,nombre);
  const anterior=fs.existsSync(destino)?fs.readFileSync(destino):null;

  if(anterior!==null){
   const nombreRespaldo=
    (carpeta===panel?"PANEL_":"LOBO2_")+
    nombre.replaceAll(/[\\/]/g,"_");
   fs.writeFileSync(ruta(respaldo,nombreRespaldo),anterior);
  }

  anteriores.push({destino,anterior});
  fs.writeFileSync(destino,contenido,"utf8");
 }

 if(!motorAntes.equals(fs.readFileSync(ruta(dos,"engine.js")))){
  throw Error("EL MOTOR CAMBIO INESPERADAMENTE");
 }

 console.log("LOBO PRO 2: CONEXION INSTALADA");
 console.log("LICENCIAS INDIVIDUALES: PREPARADAS");
 console.log("PANTALLA DE ACTIVACION: OK");
 console.log("ENGINE.JS: INTACTO");
 console.log("LOBO PRO 1: INTACTO");
 console.log("RESPALDO: "+respaldo);
 console.log("SIGUIENTE: REINICIAR CQ CONTROL Y PROBAR");

}catch(e){
 for(const x of anteriores.reverse()){
  if(x.anterior===null){
   if(fs.existsSync(x.destino))fs.unlinkSync(x.destino);
  }else{
   fs.writeFileSync(x.destino,x.anterior);
  }
 }
 throw e;
}