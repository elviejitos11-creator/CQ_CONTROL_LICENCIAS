"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db,admin){

 const columnas=db.prepare("PRAGMA table_info(licencias)").all();

 if(!columnas.some(c=>c.name==="max_perfiles")){
  db.exec(
   "ALTER TABLE licencias ADD COLUMN max_perfiles INTEGER NOT NULL DEFAULT 1"
  );
 }

 db.exec(`
 CREATE TABLE IF NOT EXISTS instalaciones_licencia(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL,
  dispositivo_id TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(licencia_id,dispositivo_id)
 );
 CREATE INDEX IF NOT EXISTS idx_instalaciones_licencia
 ON instalaciones_licencia(licencia_id);
 `);

 app.get("/api/control/limites",admin,(req,res)=>{
  try{
   const filas=db.prepare(`
    SELECT l.id,l.max_perfiles,
     (SELECT COUNT(*) FROM instalaciones_licencia i
      WHERE i.licencia_id=l.id) AS utilizados
    FROM licencias l
   `).all();
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

app.get("/api/control/dispositivos/:licenciaId",admin,(req,res)=>{
  try {
    const id=Number(req.params.licenciaId);
    if(!Number.isSafeInteger(id)||id<1)
      return res.status(400).json({error:"Licencia invalida"});

    const licencia=db.prepare(
      "SELECT id FROM licencias WHERE id=?"
    ).get(id);

    if(!licencia)
      return res.status(404).json({error:"Licencia no encontrada"});

    const dispositivos=db.prepare(
      "SELECT id,dispositivo_id,creado_en FROM instalaciones_licencia WHERE licencia_id=? ORDER BY id"
    ).all(id);

    res.set("Cache-Control","no-store")
       .json({ok:true,dispositivos});
  } catch(e) {
    console.error("Consultar dispositivos:",e);
    res.status(500).json({error:"Error consultando dispositivos"});
  }
});

app.delete("/api/control/dispositivos/:licenciaId/:registroId",admin,(req,res)=>{
  try {
    const licenciaId=Number(req.params.licenciaId);
    const registroId=Number(req.params.registroId);

    if(!Number.isSafeInteger(licenciaId)||licenciaId<1||
       !Number.isSafeInteger(registroId)||registroId<1)
      return res.status(400).json({error:"Identificador invalido"});

    const licencia=db.prepare(
      "SELECT id FROM licencias WHERE id=?"
    ).get(licenciaId);

    if(!licencia)
      return res.status(404).json({error:"Licencia no encontrada"});

    const resultado=db.prepare(
      "DELETE FROM instalaciones_licencia WHERE id=? AND licencia_id=?"
    ).run(registroId,licenciaId);

    if(resultado.changes!==1)
      return res.status(404).json({error:"Dispositivo no encontrado"});

    res.set("Cache-Control","no-store")
       .json({ok:true,liberados:1});
  } catch(e) {
    console.error("Liberar dispositivo:",e);
    res.status(500).json({error:"No se pudo liberar el dispositivo"});
  }
});

};