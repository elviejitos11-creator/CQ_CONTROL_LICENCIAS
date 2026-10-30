
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
      !["LOBO_PRO_1","LOBO_PRO_2","LOBO_PRO_1_NORMAL","LOBO_PRO_2_NORMAL","PANEL3_TELEGRAM_CLIENTE_1","PANEL3_TELEGRAM_CLIENTE_2","PANENEL2_TELEGRAM_UN_POST","PANAL2_TELEGRAM_DOS_POST"].includes(producto))
    return res.status(400).json({error:"Datos invalidos"});

   const c=db.prepare(
    "SELECT id FROM clientes WHERE id=?"
   ).get(cliente);

   /* CQ_SEED_PRODUCTOS_SEGURO_V1 */
const cqProductos = [
  ["LOBO_PRO_1", "LOBO PRO 1"],
  ["LOBO_PRO_2", "LOBO PRO 2"],
  ["LOBO_PRO_1_NORMAL", "LOBO PRO 1 NORMAL"],
  ["LOBO_PRO_2_NORMAL", "LOBO PRO 2 NORMAL"],
  ["PANEL3_TELEGRAM_CLIENTE_1", "PANEL3 TELEGRAM CLIENTE UN POST"],
  ["PANEL3_TELEGRAM_CLIENTE_2", "PANEL3 TELEGRAM CLIENTE DOS POSTS"],
  ["PANENEL2_TELEGRAM_UN_POST", "PANENEL2 TELEGRAM UN POST"],
  ["PANAL2_TELEGRAM_DOS_POST", "PANAL2 TELEGRAM DOS POST"]
];

const cqInsertarProducto = db.prepare(
  "INSERT OR IGNORE INTO productos (codigo,nombre) VALUES (?,?)"
);

db.transaction(() => {
  for (const [codigo,nombre] of cqProductos) {
    cqInsertarProducto.run(codigo,nombre);
  }
})();
/* FIN CQ_SEED_PRODUCTOS_SEGURO_V1 */
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

