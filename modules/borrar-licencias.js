"use strict";
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
};