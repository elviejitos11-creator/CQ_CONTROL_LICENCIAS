"use strict";

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
}