"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const crypto=require("crypto");
const Database=require("better-sqlite3");

async function main(){
 const root=process.cwd();
 const ruta=n=>path.join(root,n);

 const serverFile=ruta("server.js");
 const htmlFile=ruta("public/control.html");
 const apiFile=ruta("modules/fichas-clientes.js");
 const uiFile=ruta("public/fichas-clientes.js");
 const dbFile=ruta("data/cq_control.db");

 for(const f of [serverFile,htmlFile,dbFile]){
  if(!fs.existsSync(f))throw Error("FALTA ARCHIVO: "+f);
 }

 const server=fs.readFileSync(serverFile,"utf8");
 const html=fs.readFileSync(htmlFile,"utf8");

 const marca="const requiereAdmin=configurarAcceso(app,db);";
 const conexion='require("./modules/fichas-clientes")(app,db,requiereAdmin);';

 if(!server.includes(marca))
  throw Error("NO SE ENCONTRO LA AUTENTICACION");

 if(server.includes(conexion)||html.includes("/fichas-clientes.js"))
  throw Error("ESTA VERSION YA ESTA INSTALADA. NO SE DUPLICO.");

 const patronCard=/card\.append\(titulo,estado,activar,suspender,nueva(?:,borrar)?\);/;
 const cardMatch=html.match(patronCard);

 if(!cardMatch)
  throw Error("ESTRUCTURA DE LICENCIAS INESPERADA");

 const patronCrear=/"\/api\/control\/crear-licencia"/;

 if(!patronCrear.test(html))
  throw Error("FORMULARIO DE CREACION INESPERADO");

 if(!html.includes('id="dias"') ||
    !html.includes('id="maxPerfilesNuevo"'))
  throw Error("NO SE ENCONTRARON LOS CAMPOS DE MEMBRESIA");

 const api=String.raw`
"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db,admin){
 const secreto=process.env.SESSION_SECRET;
 if(!secreto)throw Error("FALTA SESSION_SECRET");

 const key=crypto.scryptSync(
  secreto,"CQ-FICHAS-CLIENTES-V1",32
 );

 db.exec("CREATE TABLE IF NOT EXISTS cq_claves_fichas("+
  "licencia_id INTEGER PRIMARY KEY,"+
  "cifrado TEXT NOT NULL)");

 function hash(s){
  return crypto.createHash("sha256")
   .update(s).digest("hex");
 }

 function cifrar(texto){
  const iv=crypto.randomBytes(12);
  const c=crypto.createCipheriv("aes-256-gcm",key,iv);
  const dato=Buffer.concat([
   c.update(texto,"utf8"),c.final()
  ]);
  return [iv,c.getAuthTag(),dato]
   .map(x=>x.toString("base64")).join(".");
 }

 function descifrar(s){
  try{
   const [iv,tag,dato]=s.split(".")
    .map(x=>Buffer.from(x,"base64"));
   const d=crypto.createDecipheriv("aes-256-gcm",key,iv);
   d.setAuthTag(tag);
   return Buffer.concat([
    d.update(dato),d.final()
   ]).toString("utf8");
  }catch(e){return null}
 }

 function guardar(id,clave){
  db.prepare(
   "INSERT INTO cq_claves_fichas(licencia_id,cifrado) "+
   "VALUES(?,?) ON CONFLICT(licencia_id) "+
   "DO UPDATE SET cifrado=excluded.cifrado"
  ).run(id,cifrar(clave));
 }

 function generar(){
  return "CQ-"+crypto.randomBytes(8)
   .toString("hex").toUpperCase()
   .match(/.{4}/g).join("-");
 }

 function obtener(req,res){
  const id=Number(req.params.id);

  if(!Number.isSafeInteger(id)||id<=0){
   res.status(400).json({error:"ID invalido"});
   return null;
  }

  const l=db.prepare(
   "SELECT * FROM licencias WHERE id=?"
  ).get(id);

  if(!l){
   res.status(404).json({error:"Licencia no encontrada"});
   return null;
  }
  return l;
 }

 app.get("/api/cq-fichas-clientes/codigos",admin,(req,res)=>{
  try{
   const filas=db.prepare(
    "SELECT licencia_id,cifrado FROM cq_claves_fichas"
   ).all();
   const codigos={};
   for(const f of filas){
    codigos[f.licencia_id]=descifrar(f.cifrado);
   }
   res.set("Cache-Control","no-store").json(codigos);
  }catch(e){
   res.status(500).json({error:"No se pudieron consultar claves"});
  }
 });

 app.post("/api/cq-fichas-clientes/crear",admin,(req,res)=>{
  try{
   const cliente=Number(req.body?.cliente_id);
   const producto=String(req.body?.producto_codigo||"");
   const dias=Number(req.body?.dias);
   const perfiles=Number(req.body?.max_perfiles);

   if(!Number.isSafeInteger(cliente)||cliente<=0||
      !Number.isSafeInteger(dias)||dias<0||
      !Number.isSafeInteger(perfiles)||perfiles<1||
      !["LOBO_PRO_1","LOBO_PRO_2"].includes(producto))
    return res.status(400).json({error:"Datos invalidos"});

   const c=db.prepare(
    "SELECT id FROM clientes WHERE id=?"
   ).get(cliente);

   const p=db.prepare(
    "SELECT id FROM productos WHERE codigo=?"
   ).get(producto);

   if(!c||!p)
    return res.status(404).json({error:"Cliente o producto no encontrado"});

   let vencimiento;
   try{
    vencimiento=new Date(Date.now()+dias*86400000).toISOString();
   }catch(e){
    return res.status(400).json({error:"Fecha fuera de rango"});
   }

   const clave=generar();

   const crear=db.transaction(()=>{
    const r=db.prepare(
     "INSERT INTO licencias("+
     "cliente_id,producto_id,producto_codigo,clave_hash,"+
     "estado,vence_en,max_perfiles) "+
     "VALUES(?,?,?,?,'ACTIVA',?,?)"
    ).run(cliente,p.id,producto,hash(clave),vencimiento,perfiles);

    const id=Number(r.lastInsertRowid);
    guardar(id,clave);
    return id;
   });

   const id=crear();
   res.set("Cache-Control","no-store");
   res.status(201).json({
    ok:true,id,clave,vence_en:vencimiento
   });

  }catch(e){
   console.error("Crear:",e.message);
   res.status(500).json({error:"No se pudo crear la licencia"});
  }
 });

 app.post("/api/cq-fichas-clientes/:id/vincular",admin,(req,res)=>{
  try{
   const l=obtener(req,res);if(!l)return;
   const clave=String(req.body?.clave||"").trim();

   if(!/^CQ-(?:[A-F0-9]{48}|(?:[A-F0-9]{4}-){3}[A-F0-9]{4})$/.test(clave)||
      hash(clave)!==l.clave_hash)
    return res.status(400).json({
     error:"El codigo no corresponde a esta licencia"
    });

   guardar(l.id,clave);
   res.json({ok:true});
  }catch(e){
   res.status(500).json({error:"No se pudo vincular el codigo"});
  }
 });

 app.post("/api/cq-fichas-clientes/:id/cambiar",admin,(req,res)=>{
  try{
   const l=obtener(req,res);if(!l)return;
   const clave=generar();

   db.transaction(()=>{
    db.prepare(
     "UPDATE licencias SET clave_hash=?,dispositivo_id=NULL WHERE id=?"
    ).run(hash(clave),l.id);

    guardar(l.id,clave);

    db.prepare(
     "DELETE FROM instalaciones_licencia WHERE licencia_id=?"
    ).run(l.id);
   })();

   res.set("Cache-Control","no-store")
    .json({ok:true,clave});
  }catch(e){
   console.error("Cambiar clave:",e.message);
   res.status(500).json({error:"No se pudo cambiar la clave"});
  }
 });

 app.post("/api/cq-fichas-clientes/:id/tiempo",admin,(req,res)=>{
  try{
   const l=obtener(req,res);if(!l)return;

   const modo=String(req.body?.modo||"");
   const dias=Number(req.body?.dias);

   if(!["agregar","quitar","establecer"].includes(modo)||
      !Number.isSafeInteger(dias)||dias<0)
    return res.status(400).json({error:"Cantidad de dias invalida"});

   const anterior=Date.parse(l.vence_en);
   if(!Number.isFinite(anterior))
    return res.status(400).json({error:"Fecha anterior invalida"});

   const ms=dias*86400000;
   let destino;

   if(modo==="agregar")
    destino=Math.max(Date.now(),anterior)+ms;
   else if(modo==="quitar")
    destino=anterior-ms;
   else
    destino=Date.now()+ms;

   let fecha;
   try{
    fecha=new Date(destino).toISOString();
   }catch(e){
    return res.status(400).json({
     error:"Cantidad fuera del rango permitido por las fechas"
    });
   }

   db.prepare(
    "UPDATE licencias SET vence_en=? WHERE id=?"
   ).run(fecha,l.id);

   res.json({ok:true,vence_en:fecha});
  }catch(e){
   res.status(500).json({error:"No se pudo editar el vencimiento"});
  }
 });
};
`;

 const ui=String.raw`
"use strict";

async function cqPeticion(url,metodo="GET",datos){
 const opt={
  method:metodo,
  credentials:"same-origin",
  cache:"no-store"
 };

 if(datos!==undefined){
  opt.headers={"Content-Type":"application/json"};
  opt.body=JSON.stringify(datos);
 }

 const r=await fetch(url,opt);
 const d=await r.json().catch(()=>({}));

 if(!r.ok)throw Error(d.error||"Error "+r.status);
 return d;
}

function cqFichaCliente(card,l){

 // Ocultar botones antiguos duplicados.
 for(const b of card.querySelectorAll("button")){
  if(/CAMBIAR CLAVE|GENERAR NUEVA CLAVE|RESTABLECER CODIGO|EDITAR TIEMPO/i.test(b.textContent))
   b.style.display="none";
 }

 const grid=document.createElement("div");
 grid.style.display="grid";
 grid.style.gridTemplateColumns="repeat(auto-fit,minmax(220px,1fr))";
 grid.style.gap="12px";
 grid.style.marginTop="14px";

 function caja(){
  const x=document.createElement("div");
  x.style.padding="14px";
  x.style.border="1px solid #455175";
  x.style.borderRadius="10px";
  return x;
 }

 function titulo(t){
  const x=document.createElement("strong");
  x.textContent=t;
  x.style.display="block";
  x.style.marginBottom="10px";
  return x;
 }

 const claveCaja=caja();
 const clave=titulo("Codigo de licencia");
 const valor=document.createElement("code");
 valor.textContent="Codigo anterior no disponible";
 valor.style.display="block";
 valor.style.overflowWrap="anywhere";
 valor.style.userSelect="all";
 valor.style.marginBottom="10px";

 const copiar=document.createElement("button");
 copiar.textContent="COPIAR";
 copiar.disabled=true;

 copiar.onclick=async()=>{
  try{
   await navigator.clipboard.writeText(valor.textContent);
   msg("Codigo copiado correctamente.");
  }catch(e){
   msg("Selecciona el codigo y pulsa Ctrl+C.");
  }
 };

 const vincular=document.createElement("button");
 vincular.textContent="REGISTRAR CODIGO ACTUAL";

 vincular.onclick=async()=>{
  const codigo=prompt("Pega el codigo actual de esta licencia:");
  if(codigo===null)return;

  try{
   await cqPeticion(
    "/api/cq-fichas-clientes/"+l.id+"/vincular",
    "POST",{clave:codigo.trim()}
   );
   valor.textContent=codigo.trim();
   copiar.disabled=false;
   vincular.style.display="none";
   msg("Codigo registrado sin cambiar la licencia.");
  }catch(e){msg(e.message)}
 };

 const cambiar=document.createElement("button");
 cambiar.textContent="RESTABLECER CODIGO";

 cambiar.onclick=async()=>{
  if(!confirm(
   "¿Cambiar este codigo? El anterior dejara de funcionar."
  ))return;

  try{
   const r=await cqPeticion(
    "/api/cq-fichas-clientes/"+l.id+"/cambiar",
    "POST",{}
   );
   valor.textContent=r.clave;
   copiar.disabled=false;
   vincular.style.display="none";
   msg("Nuevo codigo guardado en esta licencia.");
  }catch(e){msg(e.message)}
 };

 claveCaja.append(clave,valor,copiar,vincular,cambiar);

 const perfilCaja=caja();
 const perfilTitulo=titulo("Perfiles permitidos");
 const uso=document.createElement("p");
 uso.textContent="Consultando...";

 const cantidad=document.createElement("input");
 cantidad.type="number";
 cantidad.min="1";
 cantidad.step="1";
 cantidad.style.width="110px";

 const guardar=document.createElement("button");
 guardar.textContent="GUARDAR";

 async function cargarPerfiles(){
  const datos=await cqPeticion("/api/control/limites");
  const x=datos.find(v=>Number(v.id)===Number(l.id));

  if(x){
   cantidad.value=x.max_perfiles;
   uso.textContent=x.utilizados+" / "+x.max_perfiles+
    " perfiles utilizados";
  }
 }

 guardar.onclick=async()=>{
  const n=Number(cantidad.value);

  if(!Number.isSafeInteger(n)||n<1){
   msg("Introduce una cantidad valida de perfiles.");
   return;
  }

  try{
   await cqPeticion(
    "/api/control/limites/"+l.id,
    "PATCH",{max_perfiles:n}
   );
   await cargarPerfiles();
   msg("Cantidad de perfiles guardada.");
  }catch(e){msg(e.message)}
 };

 perfilCaja.append(perfilTitulo,uso,cantidad,guardar);
 grid.append(claveCaja,perfilCaja);
 card.append(grid);

 cqPeticion("/api/cq-fichas-clientes/codigos").then(x=>{
  if(x[l.id]){
   valor.textContent=x[l.id];
   copiar.disabled=false;
   vincular.style.display="none";
  }
 }).catch(()=>{});

 cargarPerfiles().catch(e=>uso.textContent=e.message);

 // EDITAR VENCIMIENTO DENTRO DE LA MISMA LICENCIA.
 const tiempo=caja();
 tiempo.style.marginTop="12px";

 const tituloTiempo=titulo("Editar tiempo de vencimiento");

 const fecha=document.createElement("p");
 fecha.textContent="Vence: "+l.vence_en;

 const operacion=document.createElement("select");

 for(const [v,t] of [
  ["agregar","Agregar dias"],
  ["quitar","Quitar dias"],
  ["establecer","Establecer dias desde hoy"]
 ]){
  const o=document.createElement("option");
  o.value=v;
  o.textContent=t;
  operacion.append(o);
 }

 const dias=document.createElement("input");
 dias.type="number";
 dias.min="0";
 dias.step="1";
 dias.value="30";
 dias.placeholder="Cantidad de dias";
 dias.style.width="145px";

 const aplicar=document.createElement("button");
 aplicar.textContent="GUARDAR VENCIMIENTO";

 aplicar.onclick=async()=>{
  const n=Number(dias.value);

  if(dias.value.trim()===""||
     !Number.isSafeInteger(n)||n<0){
   msg("Escribe una cantidad entera valida de dias.");
   return;
  }

  if(!confirm("¿Guardar el vencimiento sin cambiar el codigo?"))
   return;

  aplicar.disabled=true;

  try{
   await cqPeticion(
    "/api/cq-fichas-clientes/"+l.id+"/tiempo",
    "POST",{modo:operacion.value,dias:n}
   );
   await cargar();
   msg("Vencimiento actualizado. El codigo sigue igual.");
  }catch(e){
   msg(e.message);
  }finally{
   aplicar.disabled=false;
  }
 };

 const fila=document.createElement("div");
 fila.style.display="flex";
 fila.style.flexWrap="wrap";
 fila.style.gap="9px";
 fila.style.alignItems="center";
 fila.append(operacion,dias,aplicar);

 tiempo.append(tituloTiempo,fecha,fila);
 card.append(tiempo);
}
`;

 const serverNuevo=server.replace(marca,marca+conexion);

 let htmlNuevo=html.replace(
  cardMatch[0],
  cardMatch[0]+"\n   cqFichaCliente(card,l);"
 );

 // Convertir el selector de dias en campo libre.
 const diasPatron=/<select\s+id="dias"[^>]*>[\s\S]*?<\/select>/i;

 if(!diasPatron.test(htmlNuevo))
  throw Error("SELECTOR DE DIAS NO ENCONTRADO");

 htmlNuevo=htmlNuevo.replace(
  diasPatron,
  '<label>Dias <input id="dias" type="number" min="0" step="1" value="30" required style="width:125px"></label>'
 );

 // Usar la nueva creacion que guarda el codigo cifrado.
 htmlNuevo=htmlNuevo.replace(
  patronCrear,
  '"/api/cq-fichas-clientes/crear"'
 );

 // Los codigos se muestran dentro de cada ficha,
 // no en la seccion de crear membresia.
 htmlNuevo=htmlNuevo.replace(
  "</head>",
  '<style>#clave{display:none!important}</style>\n</head>'
 );

 // Cargar el modulo de interfaz antes de las funciones existentes.
 const scriptInline=htmlNuevo.indexOf("<script>");

 if(scriptInline<0)
  throw Error("SCRIPT PRINCIPAL NO ENCONTRADO");

 htmlNuevo=
  htmlNuevo.slice(0,scriptInline)+
  '<script src="/fichas-clientes.js"></script>\n'+
  htmlNuevo.slice(scriptInline);

 new vm.Script(api,{filename:"fichas-clientes-api.js"});
 new vm.Script(ui,{filename:"fichas-clientes-ui.js"});
 new vm.Script(serverNuevo,{filename:"server.js"});

 for(const s of htmlNuevo.matchAll(/<script>([\s\S]*?)<\/script>/g)){
  new vm.Script(s[1],{filename:"control.html"});
 }

 const respaldo=ruta("RESPALDO_FICHAS_CLIENTES_"+Date.now());
 fs.mkdirSync(respaldo);

 // Respaldo consistente de SQLite.
 const db=new Database(dbFile,{readonly:true});

 try{
  await db.backup(path.join(respaldo,"cq_control.db"));
 }finally{
  db.close();
 }

 fs.copyFileSync(serverFile,path.join(respaldo,"server.js"));
 fs.copyFileSync(htmlFile,path.join(respaldo,"control.html"));

 const cambios=[
  [apiFile,api],
  [uiFile,ui],
  [serverFile,serverNuevo],
  [htmlFile,htmlNuevo]
 ];

 const escritos=[];

 try{
  for(const [destino,contenido] of cambios){
   const anterior=fs.existsSync(destino)
    ?fs.readFileSync(destino):null;

   escritos.push({destino,anterior});
   fs.writeFileSync(destino,contenido,"utf8");
  }

  console.log("CUADRO DE CLAVE POR LICENCIA: OK");
  console.log("COPIAR CODIGO: OK");
  console.log("CUADRO DE PERFILES: OK");
  console.log("EDITAR VENCIMIENTO: OK");
  console.log("DIAS LIBRES: OK");
  console.log("CLAVES EXISTENTES: INTACTAS");
  console.log("BASE DE DATOS RESPALDADA: OK");
  console.log("MOTORES: INTACTOS");
  console.log("RESPALDO:",respaldo);
  console.log("PENDIENTE: REINICIAR SERVIDOR");

 }catch(e){
  for(const x of escritos.reverse()){
   if(x.anterior===null){
    if(fs.existsSync(x.destino))
     fs.unlinkSync(x.destino);
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