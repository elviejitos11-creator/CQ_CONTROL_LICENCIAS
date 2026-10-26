"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const crypto=require("crypto");

const panel=process.cwd();
const ext=process.argv[2];
const ruta=(d,n)=>path.join(d,n);
const leer=(d,n)=>fs.readFileSync(ruta(d,n),"utf8");

for(const n of ["server.js","modules/licencias.js","modules/licencias-api.js"]){
 if(!fs.existsSync(ruta(panel,n)))throw Error("FALTA: "+n);
}
for(const n of ["manifest.json","background.js","loader.js","popup.html","engine.js"]){
 if(!fs.existsSync(ruta(ext,n)))throw Error("FALTA EN EXTENSION: "+n);
}

const server=leer(panel,"server.js");
const bg=leer(ext,"background.js");
const loader=leer(ext,"loader.js");
const popup=leer(ext,"popup.html");
const manifest=JSON.parse(leer(ext,"manifest.json"));

const marca="const requiereAdmin=configurarAcceso(app,db);";

if(!server.includes(marca))throw Error("NO SE ENCONTRO AUTENTICACION");
if(!bg.includes("CQ_VERIFICAR_LOBO_1"))throw Error("NO SE ENCONTRO CONEXION ANTERIOR");
if(!loader.includes("CQ_VERIFICAR_LOBO_1"))throw Error("LOADER INESPERADO");
if(manifest.manifest_version!==3)throw Error("MANIFEST INESPERADO");
if(manifest.background?.service_worker!=="background.js")throw Error("BACKGROUND INESPERADO");

const inicio=bg.lastIndexOf("chrome.runtime.onMessage.addListener((msg,sender,reply)=>{");
if(inicio<0)throw Error("NO SE ENCONTRO LISTENER ANTERIOR");
const anterior=bg.slice(inicio);

if(!anterior.includes("CQ_VERIFICAR_LOBO_1") ||
   !anterior.includes("EQUIPO_PRUEBA_1") ||
   !anterior.trimEnd().endsWith("});")){
 throw Error("ESTRUCTURA ANTERIOR DIFERENTE. SIN CAMBIOS.");
}

const modulo=`"use strict";
const crypto=require("node:crypto");
const hash=s=>crypto.createHash("sha256").update(s).digest("hex");

module.exports=function(app,db){
 app.post("/api/licencias/activar-instalacion",(req,res)=>{
  try{
   const clave=String(req.body?.clave||"").trim();
   const producto=String(req.body?.producto||"");
   const dispositivo=String(req.body?.dispositivo||"");

   if(!/^CQ-[A-F0-9]{48}$/.test(clave) ||
      producto!=="LOBO_PRO_1" ||
      !/^[a-f0-9-]{36}$/.test(dispositivo)){
    return res.status(400).json({autorizada:false,motivo:"datos_invalidos"});
   }

   const l=db.prepare(
    "SELECT l.id,l.producto_codigo,l.estado,l.vence_en,l.dispositivo_id,c.nombre AS cliente FROM licencias l JOIN clientes c ON c.id=l.cliente_id WHERE l.clave_hash=?"
   ).get(hash(clave));

   if(!l||l.producto_codigo!==producto)
    return res.status(403).json({autorizada:false,motivo:"licencia_invalida"});

   if(String(l.estado).toUpperCase()!=="ACTIVA")
    return res.status(403).json({autorizada:false,motivo:"licencia_suspendida"});

   if(!Number.isFinite(Date.parse(l.vence_en))||Date.parse(l.vence_en)<=Date.now())
    return res.status(403).json({autorizada:false,motivo:"licencia_vencida"});

   const u=db.prepare(
    "UPDATE licencias SET dispositivo_id=? WHERE id=? AND (dispositivo_id IS NULL OR dispositivo_id='' OR dispositivo_id=?)"
   ).run(dispositivo,l.id,dispositivo);

   if(!u.changes)
    return res.status(403).json({autorizada:false,motivo:"otro_dispositivo"});

   res.set("Cache-Control","no-store").json({
    autorizada:true,cliente:l.cliente,vence_en:l.vence_en
   });
  }catch(e){
   console.error("Activacion:",e.message);
   res.status(500).json({autorizada:false,motivo:"error_servidor"});
  }
 });
};`;

const conexion='require("./modules/activacion-individual")(app,db);';

const serverNuevo=server.includes(conexion)
 ? server
 : server.replace(marca,marca+conexion);

const bgNuevo=bg.slice(0,inicio)+`
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.tipo!=="CQ_VERIFICAR_LOBO_1" &&
    msg?.tipo!=="CQ_ACTIVAR_LOBO_1")return;

 (async()=>{
  try{
   if(msg.tipo==="CQ_ACTIVAR_LOBO_1"){
    const clave=String(msg.clave||"").trim();
    const datos=await chrome.storage.local.get(["cqDispositivo"]);
    const dispositivo=datos.cqDispositivo||crypto.randomUUID();

    const r=await fetch("http://127.0.0.1:7000/api/licencias/activar-instalacion",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({clave,producto:"LOBO_PRO_1",dispositivo})
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

    reply({autorizada:true,cliente:d.cliente,vence_en:d.vence_en});
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
     producto:"LOBO_PRO_1",
     dispositivo:v.cqDispositivo
    })
   });

   const d=await r.json();
   reply({autorizada:r.ok&&d.autorizada===true,motivo:d.motivo||null});

  }catch(e){
   reply({autorizada:false,motivo:"servidor_no_disponible"});
  }
 })();

 return true;
});
`;

const loaderNuevo=`(async()=>{
 try{
  const {loboActivo}=await chrome.storage.local.get({loboActivo:false});
  if(!loboActivo)return;

  const r=await chrome.runtime.sendMessage({tipo:"CQ_VERIFICAR_LOBO_1"});

  if(!r?.autorizada){
   console.warn("CQ CONTROL: licencia no autorizada",r?.motivo);
   return;
  }

  chrome.runtime.sendMessage({tipo:"LOBO_CARGAR_MOTOR"});
 }catch(e){
  console.error("CQ CONTROL",e);
 }
})();`;

manifest.host_permissions=[
 ...new Set([...(manifest.host_permissions||[]),"http://127.0.0.1:7000/*"])
];

const html=`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>LOBO PRO - Activacion</title>
<style>
body{background:#0d1020;color:white;font:16px Arial;max-width:480px;margin:45px auto;padding:20px}
input,button{box-sizing:border-box;width:100%;padding:13px;margin:9px 0;border-radius:8px}
input{background:#1b2137;color:white;border:1px solid #555}
button{background:#7040df;border:0;color:white;cursor:pointer}
#estado{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
</head>
<body>
<h1>LOBO PRO 1</h1>
<h2>Activacion individual</h2>
<p>Introduce la licencia asignada al cliente en CQ CONTROL.</p>
<input id="clave" placeholder="CQ-..." autocomplete="off" spellcheck="false">
<button id="activar">ACTIVAR ESTA INSTALACION</button>
<p id="estado"></p>
<script src="cq-activar.js"></script>
</body>
</html>`;

const activarJS=`const estado=document.getElementById("estado");

chrome.storage.local.get(["cqCliente"],v=>{
 if(v.cqCliente)estado.textContent="Cliente actual: "+v.cqCliente;
});

document.getElementById("activar").addEventListener("click",async()=>{
 estado.textContent="Consultando CQ CONTROL...";
 try{
  const clave=document.getElementById("clave").value.trim();
  const r=await chrome.runtime.sendMessage({tipo:"CQ_ACTIVAR_LOBO_1",clave});
  estado.textContent=r?.autorizada
   ?"ACTIVADA PARA: "+r.cliente+"\\nVence: "+r.vence_en
   :"NO AUTORIZADA: "+(r?.motivo||"error");
 }catch(e){
  estado.textContent="Error: "+e.message;
 }
});`;

if(!/<\/body\s*>/i.test(popup))throw Error("POPUP INESPERADO");

const enlace='<div style="margin:12px;text-align:center"><a href="cq-activar.html" target="_blank" style="color:white;background:#7445ee;padding:12px;border-radius:8px;display:inline-block;text-decoration:none">ACTIVAR LICENCIA / VER CLIENTE</a></div>';

const popupNuevo=popup.includes("cq-activar.html")
 ? popup
 : popup.replace(/<\/body\s*>/i,enlace+"\n</body>");

for(const [n,s] of [
 ["server.js",serverNuevo],
 ["activacion-individual.js",modulo],
 ["background.js",bgNuevo],
 ["loader.js",loaderNuevo],
 ["cq-activar.js",activarJS]
]){
 new vm.Script(s,{filename:n});
}

const motorHash=crypto.createHash("sha256")
 .update(fs.readFileSync(ruta(ext,"engine.js"))).digest("hex");

const respaldo=ruta(panel,"RESPALDO_INDIVIDUAL_"+Date.now());
fs.mkdirSync(respaldo);

const cambios=[
 [panel,"server.js",serverNuevo],
 [panel,"modules/activacion-individual.js",modulo],
 [ext,"manifest.json",JSON.stringify(manifest,null,2)],
 [ext,"background.js",bgNuevo],
 [ext,"loader.js",loaderNuevo],
 [ext,"popup.html",popupNuevo],
 [ext,"cq-activar.html",html],
 [ext,"cq-activar.js",activarJS]
];

const guardados=[];

try{
 for(const [dir,n,contenido] of cambios){
  const destino=ruta(dir,n);
  const anterior=fs.existsSync(destino)?fs.readFileSync(destino):null;

  if(anterior!==null){
   const nombre=(dir===panel?"PANEL_":"EXT_")+n.replaceAll("/","_");
   fs.writeFileSync(ruta(respaldo,nombre),anterior);
  }

  guardados.push({destino,anterior});
  fs.writeFileSync(destino,contenido);
 }

 const actual=crypto.createHash("sha256")
  .update(fs.readFileSync(ruta(ext,"engine.js"))).digest("hex");

 if(actual!==motorHash)throw Error("MOTOR MODIFICADO INESPERADAMENTE");

 console.log("ACTIVACION INDIVIDUAL INSTALADA");
 console.log("BACKGROUND: OK");
 console.log("LOADER: OK");
 console.log("PANTALLA DE LICENCIA: OK");
 console.log("ENGINE.JS: INTACTO");
 console.log("RESPALDO:",respaldo);
 console.log("PENDIENTE: REINICIAR SERVIDOR Y RECARGAR EXTENSION");

}catch(e){
 for(const x of guardados.reverse()){
  if(x.anterior===null){
   if(fs.existsSync(x.destino))fs.unlinkSync(x.destino);
  }else{
   fs.writeFileSync(x.destino,x.anterior);
  }
 }
 throw e;
}