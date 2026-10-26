"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");
const Database=require("better-sqlite3");

const root=process.cwd();
const archivo=n=>path.join(root,n);
const leer=n=>fs.readFileSync(archivo(n),"utf8");

async function main(){

 const necesarios=[
  "server.js",
  "modules/licencias.js",
  "modules/activacion-individual.js",
  "modules/activacion-lobo2.js",
  "modules/control-admin.js",
  "public/control.html",
  "data/cq_control.db"
 ];

 for(const n of necesarios){
  if(!fs.existsSync(archivo(n)))
   throw Error("ARCHIVO FALTANTE: "+n);
 }

 const server=leer("server.js");
 const licencias=leer("modules/licencias.js");
 const admin=leer("modules/control-admin.js");
 const html=leer("public/control.html");

 if(!server.includes('const requiereAdmin=configurarAcceso(app,db);'))
  throw Error("AUTENTICACION DIFERENTE");

 if(server.includes('require("./modules/limites-perfiles")'))
  throw Error("LIMITES YA INSTALADOS. NO SE DUPLICARON.");

 const marcaFicha=/card\.append\(titulo,estado,activar,suspender,nueva(?:,borrar)?\);/;

 if(!marcaFicha.test(html))
  throw Error("ESTRUCTURA DE LICENCIAS DIFERENTE");

 if(!html.includes('id="formLicencia"'))
  throw Error("FORMULARIO DE LICENCIAS NO ENCONTRADO");

 const modulo=`"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db,admin){

 const columnas=db.prepare("PRAGMA table_info(licencias)").all();

 if(!columnas.some(c=>c.name==="max_perfiles")){
  db.exec(
   "ALTER TABLE licencias ADD COLUMN max_perfiles INTEGER NOT NULL DEFAULT 1"
  );
 }

 db.exec(\`
 CREATE TABLE IF NOT EXISTS instalaciones_licencia(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL,
  dispositivo_id TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(licencia_id,dispositivo_id)
 );
 CREATE INDEX IF NOT EXISTS idx_instalaciones_licencia
 ON instalaciones_licencia(licencia_id);
 \`);

 app.get("/api/control/limites",admin,(req,res)=>{
  try{
   const filas=db.prepare(\`
    SELECT l.id,l.max_perfiles,
     (SELECT COUNT(*) FROM instalaciones_licencia i
      WHERE i.licencia_id=l.id) AS utilizados
    FROM licencias l
   \`).all();
   res.set("Cache-Control","no-store").json(filas);
  }catch(e){
   console.error(e);
   res.status(500).json({error:"No se pudieron consultar limites"});
  }
 });

 app.patch("/api/control/limites/:id",admin,(req,res)=>{
  try{
   const id=Number(req.params.id);
   const max=Number(req.body?.max_perfiles);

   if(!Number.isSafeInteger(id)||id<1||
      !Number.isInteger(max)||max<1||max>10000)
    return res.status(400).json({
     error:"Introduce una cantidad entre 1 y 10000"
    });

   const r=db.prepare(
    "UPDATE licencias SET max_perfiles=? WHERE id=?"
   ).run(max,id);

   if(!r.changes)
    return res.status(404).json({error:"Licencia no encontrada"});

   res.json({ok:true,max_perfiles:max});
  }catch(e){
   res.status(500).json({error:"No se pudo guardar el limite"});
  }
 });
};`;

 function activacion(producto,ruta){
  return `"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db){

 const hash=s=>crypto.createHash("sha256")
  .update(s).digest("hex");

 app.post("${ruta}",(req,res)=>{
  res.set("Cache-Control","no-store");

  try{
   const clave=String(req.body?.clave||"").trim();
   const p=String(req.body?.producto||"");
   const dispositivo=String(req.body?.dispositivo||"");

   if(!/^CQ-(?:[A-F0-9]{48}|(?:[A-F0-9]{4}-){3}[A-F0-9]{4})$/.test(clave)||
      p!=="${producto}"||
      !/^[a-f0-9-]{36}$/i.test(dispositivo))
    return res.status(400).json({
     autorizada:false,motivo:"datos_invalidos"
    });

   const l=db.prepare(\`
    SELECT l.id,l.producto_codigo,l.estado,l.vence_en,
           l.max_perfiles,c.nombre AS cliente
    FROM licencias l
    JOIN clientes c ON c.id=l.cliente_id
    WHERE l.clave_hash=?
   \`).get(hash(clave));

   if(!l||l.producto_codigo!==p)
    return res.status(403).json({
     autorizada:false,motivo:"licencia_invalida"
    });

   if(String(l.estado).toUpperCase()!=="ACTIVA")
    return res.status(403).json({
     autorizada:false,motivo:"licencia_suspendida"
    });

   if(!Number.isFinite(Date.parse(l.vence_en))||
      Date.parse(l.vence_en)<=Date.now())
    return res.status(403).json({
     autorizada:false,motivo:"licencia_vencida"
    });

   const registrar=db.transaction(()=>{
    const existe=db.prepare(\`
     SELECT id FROM instalaciones_licencia
     WHERE licencia_id=? AND dispositivo_id=?
    \`).get(l.id,dispositivo);

    if(existe)return true;

    const total=db.prepare(\`
     SELECT COUNT(*) AS total FROM instalaciones_licencia
     WHERE licencia_id=?
    \`).get(l.id).total;

    if(total>=l.max_perfiles)return false;

    db.prepare(\`
     INSERT INTO instalaciones_licencia(licencia_id,dispositivo_id)
     VALUES(?,?)
    \`).run(l.id,dispositivo);

    return true;
   });

   if(!registrar())
    return res.status(403).json({
     autorizada:false,motivo:"limite_perfiles_alcanzado"
    });

   return res.json({
    autorizada:true,
    cliente:l.cliente,
    vence_en:l.vence_en
   });

  }catch(e){
   console.error("Activacion:",e.message);
   return res.status(500).json({
    autorizada:false,motivo:"error_servidor"
   });
  }
 });
};`;
 }

 const activacion1=activacion(
  "LOBO_PRO_1","/api/licencias/activar-instalacion"
 );

 const activacion2=activacion(
  "LOBO_PRO_2","/api/licencias/activar-instalacion-2"
 );

 let verificador=licencias;

 const patronDispositivo=/if\s*\(\s*licencia\.dispositivo_id\s*&&\s*licencia\.dispositivo_id\s*!==\s*dispositivo\s*\)\s*return\s*\{\s*autorizada\s*:\s*false\s*,\s*motivo\s*:\s*["']otro_dispositivo["']\s*\}\s*;/;

 if(patronDispositivo.test(verificador)){
  verificador=verificador.replace(
   patronDispositivo,
   "/* Comprobacion de perfiles mediante instalaciones_licencia */"
  );
 }

 if(!verificador.includes("function validarLicencia"))
  throw Error("VERIFICADOR INESPERADO");

 // Sustituir solamente la validacion de dispositivo:
 // en la verificacion regular se consulta el registro de instalacion.
 const patronRetorno=/return\s*\{\s*autorizada\s*:\s*true\s*,\s*licencia_id\s*:\s*licencia\.id\s*,\s*vence_en\s*:\s*licencia\.vence_en\s*\}\s*;/;

 if(!patronRetorno.test(verificador))
  throw Error("NO SE ENCONTRO EL RETORNO DEL VERIFICADOR");

 const inicioFuncion=verificador.indexOf("function validarLicencia");
 const tramo=verificador.slice(inicioFuncion);
 const patronRegistro=/const registro=db\.prepare\([\s\S]*?instalaciones_licencia[\s\S]*?return\s*\{\s*autorizada\s*:\s*false\s*,\s*motivo\s*:\s*"instalacion_no_autorizada"\s*\}\s*;/;

 if(!patronRegistro.test(tramo)){
  verificador=verificador.replace(patronRetorno,`
 const registro=db.prepare(
  "SELECT id FROM instalaciones_licencia WHERE licencia_id=? AND dispositivo_id=?"
 ).get(licencia.id,dispositivo);
 if(!registro)
  return {autorizada:false,motivo:"instalacion_no_autorizada"};
 return {autorizada:true,licencia_id:licencia.id,vence_en:licencia.vence_en};
 `);
 }
 const adminMarca='res.status(201).json({';
 if(!admin.includes(adminMarca))
  throw Error("CREACION DE LICENCIAS DIFERENTE");

 const adminNuevo=admin.replace(adminMarca,`
      const max=Number(req.body?.max_perfiles ?? 1);
      if(!Number.isInteger(max)||max<1||max>10000){
       return res.status(400).json({error:"Limite invalido"});
      }
      db.prepare("UPDATE licencias SET max_perfiles=? WHERE id=?")
        .run(max,Number(r.lastInsertRowid));
      ${adminMarca}
 `);

 const conexion='require("./modules/limites-perfiles")(app,db,requiereAdmin);';

 const serverNuevo=server.replace(
  'const requiereAdmin=configurarAcceso(app,db);',
  'const requiereAdmin=configurarAcceso(app,db);'+conexion
 );

 const ui=`"use strict";

async function configurarLimite(card,l){
 const caja=document.createElement("div");
 caja.style.border="1px solid #47516c";
 caja.style.padding="12px";
 caja.style.marginTop="12px";
 caja.style.borderRadius="9px";

 const titulo=document.createElement("strong");
 titulo.textContent="Perfiles autorizados para este codigo";

 const informacion=document.createElement("p");
 informacion.textContent="Consultando...";

 const entrada=document.createElement("input");
 entrada.type="number";
 entrada.min="1";
 entrada.max="10000";
 entrada.step="1";
 entrada.value="1";
 entrada.style.width="130px";

 const guardar=document.createElement("button");
 guardar.textContent="GUARDAR";

 caja.append(titulo,informacion,entrada,guardar);
 card.append(caja);

 async function consultar(){
  const r=await fetch("/api/control/limites",{
   credentials:"same-origin",
   cache:"no-store"
  });
  if(!r.ok)throw Error("Error consultando perfiles");

  const filas=await r.json();
  const x=filas.find(i=>Number(i.id)===Number(l.id));

  if(!x)return;

  entrada.value=x.max_perfiles;
  informacion.textContent=
   x.utilizados+" / "+x.max_perfiles+" perfiles utilizados";
 }

 guardar.onclick=async()=>{
  const valor=Number(entrada.value);

  if(!Number.isInteger(valor)||valor<1||valor>10000){
   alert("Introduce un numero entre 1 y 10000");
   return;
  }

  guardar.disabled=true;

  try{
   const r=await fetch("/api/control/limites/"+l.id,{
    method:"PATCH",
    credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({max_perfiles:valor})
   });

   const d=await r.json();

   if(!r.ok)throw Error(d.error||"No se pudo guardar");

   await consultar();
   msg("Limite de perfiles guardado. El codigo no cambio.");

  }catch(e){
   msg(e.message);
  }finally{
   guardar.disabled=false;
  }
 };

 try{
  await consultar();
 }catch(e){
  informacion.textContent=e.message;
 }
}`;

 let htmlNuevo=html;

 const marca=html.match(marcaFicha)[0];

 htmlNuevo=htmlNuevo.replace(
  marca,marca+"\n   configurarLimite(card,l);"
 );

 htmlNuevo=htmlNuevo.replace(
  '<button type="submit">GENERAR LICENCIA</button>',
  '<label>Perfiles máximos <input id="maxPerfilesNuevo" type="number" min="1" max="10000" value="20" required style="width:105px"></label><button type="submit">GENERAR LICENCIA</button>'
 );

 if(!htmlNuevo.includes('id="maxPerfilesNuevo"'))
  throw Error("NO SE PUDO AGREGAR CAMPO DE PERFILES");

 const crear=/producto_codigo:\s*\$\("producto"\)\.value,\s*dias:\s*Number\(\$\("dias"\)\.value\)/;

 if(!crear.test(htmlNuevo))
  throw Error("NO SE ENCONTRO FORMULARIO DE CREACION");

 htmlNuevo=htmlNuevo.replace(crear,
  'producto_codigo:$("producto").value,\n    dias:Number($("dias").value),\n    max_perfiles:Number($("maxPerfilesNuevo").value)'
 );

 htmlNuevo=htmlNuevo.replace(
  "</body>",
  '<script src="/limites-perfiles.js"></script>\n</body>'
 );

 for(const [nombre,contenido] of [
  ["limites-perfiles.js",modulo],
  ["activacion-individual.js",activacion1],
  ["activacion-lobo2.js",activacion2],
  ["licencias.js",verificador],
  ["control-admin.js",adminNuevo],
  ["server.js",serverNuevo],
  ["limites-perfiles-ui.js",ui]
 ]){
  new vm.Script(contenido,{filename:nombre});
 }

 for(const m of htmlNuevo.matchAll(/<script>([\s\S]*?)<\/script>/g)){
  new vm.Script(m[1],{filename:"control.html"});
 }

 const respaldo=archivo("RESPALDO_LIMITES_"+Date.now());
 fs.mkdirSync(respaldo);

 // Copia SQLite consistente antes de actualizar los archivos.
 const db=new Database(archivo("data/cq_control.db"),{readonly:true});
 try{
  await db.backup(path.join(respaldo,"cq_control.db"));
 }finally{
  db.close();
 }

 const cambios=[
  ["modules/limites-perfiles.js",modulo],
  ["modules/activacion-individual.js",activacion1],
  ["modules/activacion-lobo2.js",activacion2],
  ["modules/licencias.js",verificador],
  ["modules/control-admin.js",adminNuevo],
  ["server.js",serverNuevo],
  ["public/limites-perfiles.js",ui],
  ["public/control.html",htmlNuevo]
 ];

 const escritos=[];

 try{
  for(const [nombre,contenido] of cambios){
   const destino=archivo(nombre);
   const anterior=fs.existsSync(destino)
    ?fs.readFileSync(destino)
    :null;

   if(anterior!==null){
    fs.writeFileSync(
     path.join(respaldo,nombre.replace(/[\\/]/g,"_")),
     anterior
    );
   }

   escritos.push({destino,anterior});
   fs.writeFileSync(destino,contenido,"utf8");
  }

  console.log("LIMITES POR LICENCIA: INSTALADOS");
  console.log("CAMPO DE PERFILES AL CREAR: OK");
  console.log("EDITAR CANTIDAD DE PERFILES: OK");
  console.log("REGISTRO DE INSTALACIONES: PREPARADO");
  console.log("CLAVES Y DIAS: INTACTOS");
  console.log("MOTORES: INTACTOS");
  console.log("RESPALDO:",respaldo);
  console.log("PENDIENTE: REINICIAR SERVIDOR");

 }catch(e){
  for(const x of escritos.reverse()){
   if(x.anterior===null){
    if(fs.existsSync(x.destino))fs.unlinkSync(x.destino);
   }else fs.writeFileSync(x.destino,x.anterior);
  }
  throw e;
 }
}

main().catch(e=>{
 console.error("INSTALACION DETENIDA:",e.message);
 process.exitCode=1;
});