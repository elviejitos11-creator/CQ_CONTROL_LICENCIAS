
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
