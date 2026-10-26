"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=process.cwd();
const file=n=>path.join(root,n);
const serverFile=file("server.js");
const controlFile=file("public/control.html");
const indexFile=file("public/index.html");
const moduloFile=file("modules/claves-admin.js");

const server=fs.readFileSync(serverFile,"utf8");
const control=fs.readFileSync(controlFile,"utf8");
const index=fs.readFileSync(indexFile,"utf8");

const marca='const requiereAdmin=configurarAcceso(app,db);';
const boton='card.append(titulo,estado,activar,suspender);';
const clientes='<section>\n<h2>Registrar cliente</h2>';
const antesSalir='async function salir(){';

if(!server.includes(marca))throw Error("No se encontro la autenticacion");
if(!control.includes(boton))throw Error("Estructura de licencias diferente");
if(!control.includes(clientes))throw Error("No se encontro la seccion de clientes");
if(!control.includes(antesSalir))throw Error("No se encontro cerrar sesion");
if(!control.includes('$("licencias").replaceChildren();'))
 throw Error("No se encontro la lista de licencias");

const modulo=`"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db,requiereAdmin){
 app.post("/api/control/licencias/:id/nueva-clave",requiereAdmin,(req,res)=>{
  try{
   const id=Number(req.params.id);
   if(!Number.isSafeInteger(id)||id<1)
    return res.status(400).json({error:"ID invalido"});

   const l=db.prepare("SELECT id FROM licencias WHERE id=?").get(id);
   if(!l)return res.status(404).json({error:"Licencia no encontrada"});

   const clave="CQ-"+crypto.randomBytes(24).toString("hex").toUpperCase();
   const hash=crypto.createHash("sha256").update(clave).digest("hex");

   db.prepare(
    "UPDATE licencias SET clave_hash=?,dispositivo_id=NULL WHERE id=?"
   ).run(hash,id);

   res.set("Cache-Control","no-store");
   res.json({ok:true,id,clave});
  }catch(e){
   console.error("Nueva clave:",e.message);
   res.status(500).json({error:"No se pudo generar la clave"});
  }
 });
};`;

const conexion='require("./modules/claves-admin")(app,db,requiereAdmin);';
const serverNuevo=server.includes(conexion)
 ? server : server.replace(marca,marca+conexion);

const barra=`<section>
<h2>Resumen de administración</h2>
<div class="fila">
 <div class="item">Extensiones disponibles: <strong>2</strong></div>
 <div class="item">Clientes: <strong id="totalClientes">0</strong></div>
 <div class="item">Licencias activas: <strong id="totalActivas">0</strong></div>
 <div class="item">Licencias suspendidas: <strong id="totalSuspendidas">0</strong></div>
</div>
<p><small>Administra clientes, membresías y licencias desde esta misma pantalla.</small></p>
</section>
`;

let controlNuevo=control.replace(clientes,barra+clientes);

controlNuevo=controlNuevo.replace(
 '$("licencias").replaceChildren();',
 `$("totalClientes").textContent=clientes.length;
  $("totalActivas").textContent=licencias.filter(x=>
    String(x.estado).toUpperCase()==="ACTIVA" &&
    Date.parse(x.vence_en)>Date.now()
  ).length;
  $("totalSuspendidas").textContent=licencias.filter(x=>
    String(x.estado).toUpperCase()==="SUSPENDIDA"
  ).length;
  $("licencias").replaceChildren();`
);

controlNuevo=controlNuevo.replace(
 boton,
 `const nueva=document.createElement("button");
   nueva.textContent="GENERAR NUEVA CLAVE";
   nueva.onclick=()=>regenerarClave(l.id);
   card.append(titulo,estado,activar,suspender,nueva);`
);

controlNuevo=controlNuevo.replace(
 antesSalir,
 `async function regenerarClave(id){
 if(!confirm(
  "¿Generar nueva clave para la licencia #"+id+
  "? La clave anterior dejará de funcionar y se liberará el dispositivo anterior."
 ))return;

 try{
  const r=await api("/api/control/licencias/"+id+"/nueva-clave",{
   method:"POST",
   body:JSON.stringify({})
  });

  $("clave").textContent=
   "NUEVA CLAVE DE LICENCIA #"+id+" (CÓPIALA Y GUÁRDALA): "+r.clave;

  $("clave").scrollIntoView({behavior:"smooth",block:"center"});
  msg("Nueva clave generada para la licencia #"+id+".");
 }catch(e){msg(e.message)}
}

`+antesSalir
);

const indexNuevo=`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CQ CONTROL</title>
<meta http-equiv="refresh" content="0;url=/control.html">
</head>
<body>
<p>Abriendo panel de administración...</p>
<a href="/control.html">Entrar a CQ CONTROL</a>
</body>
</html>`;

new vm.Script(modulo,{filename:"claves-admin.js"});
new vm.Script(serverNuevo,{filename:"server.js"});

const scripts=[...controlNuevo.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if(!scripts.length)throw Error("No se encontro el script del panel");
for(const s of scripts)new vm.Script(s[1]);

const cambios=[
 [serverFile,serverNuevo],
 [moduloFile,modulo],
 [controlFile,controlNuevo],
 [indexFile,indexNuevo]
];

const respaldo=file("RESPALDO_PANEL_UNIFICADO_"+Date.now());
fs.mkdirSync(respaldo);

const escritos=[];

try{
 for(const [destino,contenido] of cambios){
  const anterior=fs.existsSync(destino)?fs.readFileSync(destino):null;
  if(anterior!==null){
   fs.writeFileSync(
    path.join(respaldo,path.relative(root,destino).replaceAll(/[\\/]/g,"_")),
    anterior
   );
  }
  escritos.push({destino,anterior});
  fs.writeFileSync(destino,contenido,"utf8");
 }

 console.log("PANEL UNIFICADO: OK");
 console.log("GENERAR NUEVA CLAVE: OK");
 console.log("RESPALDO: "+respaldo);
 console.log("EXTENSIONES Y BASE DE DATOS: INTACTAS");
 console.log("PENDIENTE: REINICIAR SERVIDOR");

}catch(e){
 for(const x of escritos.reverse()){
  if(x.anterior===null){
   if(fs.existsSync(x.destino))fs.unlinkSync(x.destino);
  }else fs.writeFileSync(x.destino,x.anterior);
 }
 throw e;
}