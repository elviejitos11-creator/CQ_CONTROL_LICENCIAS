"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");
const Database=require("better-sqlite3");

async function main(){
 const root=process.cwd();
 const serverPath=path.join(root,"server.js");
 const panelPath=path.join(root,"public","control.html");
 const apiPath=path.join(root,"modules","borrar-licencias.js");
 const dbPath=path.join(root,"data","cq_control.db");

 for(const f of [serverPath,panelPath,dbPath]){
  if(!fs.existsSync(f))throw Error("ARCHIVO FALTANTE: "+f);
 }

 const server=fs.readFileSync(serverPath,"utf8");
 const panel=fs.readFileSync(panelPath,"utf8");

 const marca="const requiereAdmin=configurarAcceso(app,db);";
 const marcaBotones="card.append(titulo,estado,activar,suspender,nueva);";
 const marcaFuncion="async function salir(){";
 const conexion='require("./modules/borrar-licencias")(app,db,requiereAdmin);';

 if(!server.includes(marca))throw Error("AUTENTICACION NO ENCONTRADA");
 if(!panel.includes(marcaBotones))throw Error("BOTONES DEL PANEL DIFERENTES");
 if(!panel.includes(marcaFuncion))throw Error("FUNCION DEL PANEL NO ENCONTRADA");
 if(fs.existsSync(apiPath))throw Error("EL MODULO YA EXISTE. NO SE DUPLICO");

 const api=`"use strict";
module.exports=function(app,db,requiereAdmin){
 app.delete("/api/control/licencias/:id",requiereAdmin,(req,res)=>{
  try{
   const id=Number(req.params.id);
   if(!Number.isSafeInteger(id)||id<1)
    return res.status(400).json({error:"ID invalido"});

   const registro=db.prepare(
    "SELECT id FROM licencias WHERE id=?"
   ).get(id);

   if(!registro)
    return res.status(404).json({error:"Licencia no encontrada"});

   db.prepare("DELETE FROM licencias WHERE id=?").run(id);

   res.set("Cache-Control","no-store");
   res.json({ok:true,id});
  }catch(e){
   console.error("Eliminar licencia:",e.message);
   res.status(500).json({error:"No se pudo eliminar"});
  }
 });
};`;

 const serverNuevo=server.replace(marca,marca+conexion);

 const botonesNuevo=`const borrar=document.createElement("button");
   borrar.textContent="ELIMINAR LICENCIA";
   borrar.className="rojo";
   borrar.onclick=()=>eliminarLicencia(l.id,l.cliente,l.producto);
   card.append(titulo,estado,activar,suspender,nueva,borrar);`;

 const funcionNueva=`async function eliminarLicencia(id,cliente,producto){
 const confirmado=confirm(
  "¿ELIMINAR DEFINITIVAMENTE ESTA LICENCIA?\\n\\n"+
  "Cliente: "+cliente+"\\n"+
  "Extensión: "+producto+"\\n"+
  "Licencia #"+id+"\\n\\n"+
  "La clave dejará de funcionar y esta membresía desaparecerá del panel."
 );

 if(!confirmado)return;

 try{
  await api("/api/control/licencias/"+id,{
   method:"DELETE"
  });
  await cargar();
  msg("Licencia #"+id+" eliminada correctamente.");
 }catch(e){
  msg("No se pudo eliminar: "+e.message);
 }
}

`;

 const panelNuevo=panel
  .replace(marcaBotones,botonesNuevo)
  .replace(marcaFuncion,funcionNueva+marcaFuncion);

 new vm.Script(api,{filename:"borrar-licencias.js"});
 new vm.Script(serverNuevo,{filename:"server.js"});

 const scripts=[...panelNuevo.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 if(!scripts.length)throw Error("SCRIPT DEL PANEL NO ENCONTRADO");
 for(const s of scripts)new vm.Script(s[1],{filename:"control.html"});

 const respaldo=path.join(
  root,"RESPALDO_ELIMINACION_"+Date.now()
 );
 fs.mkdirSync(respaldo);

 const db=new Database(dbPath,{readonly:true});
 try{
  await db.backup(path.join(respaldo,"cq_control.db"));
 }finally{
  db.close();
 }

 fs.copyFileSync(serverPath,path.join(respaldo,"server.js"));
 fs.copyFileSync(panelPath,path.join(respaldo,"control.html"));

 const escritos=[];

 try{
  for(const [destino,contenido] of [
   [apiPath,api],
   [serverPath,serverNuevo],
   [panelPath,panelNuevo]
  ]){
   const anterior=fs.existsSync(destino)
    ?fs.readFileSync(destino)
    :null;

   escritos.push({destino,anterior});
   fs.writeFileSync(destino,contenido,"utf8");
  }

  console.log("BOTON ELIMINAR LICENCIA: INSTALADO");
  console.log("API PROTEGIDA: OK");
  console.log("RESPALDO DE BASE DE DATOS: OK");
  console.log("EXTENSIONES: INTACTAS");
  console.log("RESPALDO: "+respaldo);
 }catch(e){
  for(const x of escritos.reverse()){
   if(x.anterior===null){
    if(fs.existsSync(x.destino))fs.unlinkSync(x.destino);
   }else{
    fs.writeFileSync(x.destino,x.anterior);
   }
  }
  throw e;
 }
}

main().catch(e=>{
 console.error("INSTALACION DETENIDA:",e.message);
 process.exitCode=1;
});