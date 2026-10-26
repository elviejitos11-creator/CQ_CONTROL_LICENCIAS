
"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db){
 const producto="LOBO_PRO_2_NORMAL";
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

 app.post("/api/licencias/activar-normal-2",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{
   res.json(consultar(req.body,true));
  }catch(e){
   console.error("Activacion normal 1:",e.message);
   res.status(500).json({autorizada:false,motivo:"error_servidor"});
  }
 });

 app.post("/api/licencias/verificar-normal-2",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{
   res.json(consultar(req.body,false));
  }catch(e){
   console.error("Verificacion normal 1:",e.message);
   res.status(500).json({autorizada:false,motivo:"error_servidor"});
  }
 });
};
