"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const crypto=require("crypto");

const [cliente,normal]=process.argv.slice(2);
const root=process.cwd();
const at=(d,n)=>path.join(d,n);
const read=(d,n)=>fs.readFileSync(at(d,n),"utf8").replace(/^\uFEFF/,"");

function exigir(ok,mensaje){
 if(!ok)throw Error(mensaje);
}

for(const n of ["background.js","loader.js","manifest.json","popup.html","engine.js"]){
 exigir(fs.existsSync(at(normal,n)),"FALTA EN NORMAL: "+n);
}
for(const n of ["loader.js","cq-activar.js","cq-activar.html"]){
 exigir(fs.existsSync(at(cliente,n)),"FALTA EN CLIENTE: "+n);
}
for(const n of ["server.js","modules/fichas-clientes.js","public/control.html"]){
 exigir(fs.existsSync(at(root,n)),"FALTA EN PANEL: "+n);
}

const manifest=JSON.parse(read(normal,"manifest.json"));
const background=read(normal,"background.js");
const popup=read(normal,"popup.html");
const server=read(root,"server.js");
const apiCrear=read(root,"modules/fichas-clientes.js");
const panelHtml=read(root,"public/control.html");

exigir(manifest.manifest_version===3,"MANIFEST NO ES V3");
exigir(manifest.background?.service_worker==="background.js","BACKGROUND DIFERENTE");
exigir(background.includes("LOBO_CARGAR_MOTOR"),"MOTOR NO ENCONTRADO");
exigir(!background.includes("CQ_ACTIVAR_LOBO_1_NORMAL"),"INTEGRACION YA EXISTENTE");
exigir(server.includes("const requiereAdmin=configurarAcceso(app,db);"),"AUTENTICACION DIFERENTE");

const loader=read(cliente,"loader.js")
 .replaceAll("CQ_VERIFICAR_LOBO_1","CQ_VERIFICAR_LOBO_1_NORMAL");

const activar=read(cliente,"cq-activar.js")
 .replaceAll("CQ_ACTIVAR_LOBO_1","CQ_ACTIVAR_LOBO_1_NORMAL");

const pagina=read(cliente,"cq-activar.html")
 .replaceAll("LOBO PRO 1","LOBO PRO 1 NORMAL");

exigir(loader.includes("CQ_VERIFICAR_LOBO_1_NORMAL"),"LOADER INCOMPATIBLE");
exigir(activar.includes("CQ_ACTIVAR_LOBO_1_NORMAL"),"ACTIVACION INCOMPATIBLE");

const modulo=String.raw`
"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db){
 const producto="LOBO_PRO_1_NORMAL";
 const hash=s=>crypto.createHash("sha256").update(s).digest("hex");

 db.exec(
  "CREATE TABLE IF NOT EXISTS instalaciones_licencia("+
  "id INTEGER PRIMARY KEY AUTOINCREMENT,"+
  "licencia_id INTEGER NOT NULL,"+
  "dispositivo_id TEXT NOT NULL,"+
  "creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
  "UNIQUE(licencia_id,dispositivo_id))"
 );

 function consultar(datos,activar){
  const clave=String(datos?.clave||"").trim();
  const dispositivo=String(datos?.dispositivo||"").trim();

  if(!clave||!dispositivo||datos?.producto!==producto)
   return {autorizada:false,motivo:"datos_invalidos"};

  const l=db.prepare(
   "SELECT l.id,l.estado,l.vence_en,l.max_perfiles,"+
   "c.nombre AS cliente FROM licencias l "+
   "JOIN clientes c ON c.id=l.cliente_id "+
   "WHERE l.clave_hash=? AND l.producto_codigo=?"
  ).get(hash(clave),producto);

  if(!l)return {autorizada:false,motivo:"licencia_invalida"};

  if(String(l.estado).toUpperCase()!=="ACTIVA")
   return {autorizada:false,motivo:"licencia_suspendida"};

  if(!Number.isFinite(Date.parse(l.vence_en))||
     Date.parse(l.vence_en)<=Date.now())
   return {autorizada:false,motivo:"licencia_vencida"};

  if(activar){
   const registrar=db.transaction(()=>{
    const existe=db.prepare(
     "SELECT id FROM instalaciones_licencia "+
     "WHERE licencia_id=? AND dispositivo_id=?"
    ).get(l.id,dispositivo);

    if(existe)return true;

    const usados=db.prepare(
     "SELECT COUNT(*) AS total FROM instalaciones_licencia "+
     "WHERE licencia_id=?"
    ).get(l.id).total;

    if(usados>=l.max_perfiles)return false;

    db.prepare(
     "INSERT INTO instalaciones_licencia(licencia_id,dispositivo_id) "+
     "VALUES(?,?)"
    ).run(l.id,dispositivo);

    return true;
   });

   if(!registrar())
    return {autorizada:false,motivo:"limite_perfiles_alcanzado"};
  }else{
   const existe=db.prepare(
    "SELECT id FROM instalaciones_licencia "+
    "WHERE licencia_id=? AND dispositivo_id=?"
   ).get(l.id,dispositivo);

   if(!existe)
    return {autorizada:false,motivo:"instalacion_no_autorizada"};
  }

  return {
   autorizada:true,
   cliente:l.cliente,
   vence_en:l.vence_en
  };
 }

 app.post("/api/licencias/activar-normal-1",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{
   res.json(consultar(req.body,true));
  }catch(e){
   console.error("Activacion normal 1:",e.message);
   res.status(500).json({autorizada:false,motivo:"error_servidor"});
  }
 });

 app.post("/api/licencias/verificar-normal-1",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{
   res.json(consultar(req.body,false));
  }catch(e){
   console.error("Verificacion normal 1:",e.message);
   res.status(500).json({autorizada:false,motivo:"error_servidor"});
  }
 });
};
`;

const listener=String.raw`
chrome.runtime.onMessage.addListener((mensaje,remitente,responder)=>{
 if(!mensaje||![
  "CQ_ACTIVAR_LOBO_1_NORMAL",
  "CQ_VERIFICAR_LOBO_1_NORMAL"
 ].includes(mensaje.tipo))return;

 (async()=>{
  try{
   const activar=mensaje.tipo==="CQ_ACTIVAR_LOBO_1_NORMAL";
   const actual=await chrome.storage.local.get([
    "cqNormal1Clave","cqNormal1Dispositivo"
   ]);

   const clave=activar
    ?String(mensaje.clave||"").trim()
    :String(actual.cqNormal1Clave||"");

   let dispositivo=actual.cqNormal1Dispositivo;
   if(!dispositivo)dispositivo=crypto.randomUUID();

   if(!clave){
    responder({autorizada:false,motivo:"sin_activar"});
    return;
   }

   const ruta=activar
    ?"/api/licencias/activar-normal-1"
    :"/api/licencias/verificar-normal-1";

   const r=await fetch("http://127.0.0.1:7000"+ruta,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     clave,
     producto:"LOBO_PRO_1_NORMAL",
     dispositivo
    })
   });

   const datos=await r.json();

   if(!r.ok||datos.autorizada!==true){
    responder({
     autorizada:false,
     motivo:datos.motivo||"no_autorizada"
    });
    return;
   }

   if(activar){
    await chrome.storage.local.set({
     cqNormal1Clave:clave,
     cqNormal1Dispositivo:dispositivo,
     cqCliente:datos.cliente
    });
   }

   responder(datos);
  }catch(e){
   responder({autorizada:false,motivo:"servidor_no_disponible"});
  }
 })();

 return true;
});
`;

const nuevoBackground=background+"\n"+listener;

const enlace='<div style="text-align:center;margin:10px">'+
 '<a href="cq-activar.html" target="_blank" '+
 'style="display:inline-block;background:#743de6;color:white;'+
 'padding:10px;border-radius:8px;text-decoration:none">'+
 'ACTIVAR LICENCIA / VER CLIENTE</a></div>';

exigir(/<\/body\s*>/i.test(popup),"POPUP SIN CIERRE");
const nuevoPopup=popup.replace(/<\/body\s*>/i,enlace+"\n</body>");

manifest.host_permissions=[
 ...new Set([
  ...(manifest.host_permissions||[]),
  "http://127.0.0.1:7000/*"
 ])
];

const conexion='require("./modules/activacion-normal-1")(app,db);';
exigir(!server.includes(conexion),"SERVIDOR YA CONECTADO");

const nuevoServer=server.replace(
 "const requiereAdmin=configurarAcceso(app,db);",
 "const requiereAdmin=configurarAcceso(app,db);"+conexion
);

const patronProductos=/\["LOBO_PRO_1","LOBO_PRO_2"\]\.includes\(producto\)/;
exigir(patronProductos.test(apiCrear),
 "NO SE ENCONTRO LA LISTA DE PRODUCTOS DEL FORMULARIO");

const nuevoApiCrear=apiCrear.replace(
 patronProductos,
 '["LOBO_PRO_1","LOBO_PRO_2","LOBO_PRO_1_NORMAL"].includes(producto)'
);

const uiProductos=String.raw`
document.addEventListener("DOMContentLoaded",()=>{
 const lista=document.getElementById("producto");
 if(!lista)return;

 if(![...lista.options].some(x=>x.value==="LOBO_PRO_1_NORMAL")){
  lista.add(new Option("LOBO PRO 1 NORMAL","LOBO_PRO_1_NORMAL"));
 }
});
`;

exigir(/<\/body\s*>/i.test(panelHtml),"PANEL SIN CIERRE");
const nuevoPanel=panelHtml.replace(
 /<\/body\s*>/i,
 '<script src="/productos-normales.js"></script>\n</body>'
);

for(const [nombre,codigo] of [
 ["background.js",nuevoBackground],
 ["loader.js",loader],
 ["cq-activar.js",activar],
 ["activacion-normal-1.js",modulo],
 ["server.js",nuevoServer],
 ["fichas-clientes.js",nuevoApiCrear],
 ["productos-normales.js",uiProductos]
]){
 new vm.Script(codigo,{filename:nombre});
}

const cambios=[
 [normal,"background.js",nuevoBackground],
 [normal,"loader.js",loader],
 [normal,"popup.html",nuevoPopup],
 [normal,"manifest.json",JSON.stringify(manifest,null,2)],
 [normal,"cq-activar.js",activar],
 [normal,"cq-activar.html",pagina],
 [root,"modules/activacion-normal-1.js",modulo],
 [root,"modules/fichas-clientes.js",nuevoApiCrear],
 [root,"public/productos-normales.js",uiProductos],
 [root,"public/control.html",nuevoPanel],
 [root,"server.js",nuevoServer]
];

const respaldo=at(root,"RESPALDO_LOBO1_NORMAL_"+Date.now());
const engineAntes=crypto.createHash("sha256")
 .update(fs.readFileSync(at(normal,"engine.js"))).digest("hex");

fs.mkdirSync(respaldo);
const anteriores=[];

try{
 for(const [carpeta,nombre,contenido] of cambios){
  const destino=at(carpeta,nombre);
  const anterior=fs.existsSync(destino)?fs.readFileSync(destino):null;

  if(anterior){
   const etiqueta=(carpeta===normal?"NORMAL_":"PANEL_")+
    nombre.replace(/[\\/]/g,"_");
   fs.writeFileSync(at(respaldo,etiqueta),anterior);
  }

  anteriores.push({destino,anterior});
  fs.writeFileSync(destino,contenido,"utf8");
 }

 const engineDespues=crypto.createHash("sha256")
  .update(fs.readFileSync(at(normal,"engine.js"))).digest("hex");

 exigir(engineAntes===engineDespues,"ENGINE.JS CAMBIO");

 console.log("LOBO PRO 1 NORMAL: ARCHIVOS PREPARADOS");
 console.log("PRODUCTO INDEPENDIENTE: LOBO_PRO_1_NORMAL");
 console.log("ACTIVACION INDIVIDUAL: PREPARADA");
 console.log("LIMITE DE PERFILES: PREPARADO");
 console.log("ENGINE.JS: INTACTO");
 console.log("VERSIONES CLIENTE: INTACTAS");
 console.log("RESPALDO:",respaldo);
 console.log("PENDIENTE: REINICIAR SERVIDOR Y PROBAR");

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