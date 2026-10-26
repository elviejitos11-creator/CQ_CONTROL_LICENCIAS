
document.addEventListener("DOMContentLoaded",()=>{
 const lista=document.getElementById("producto");
 if(!lista)return;

 if(![...lista.options].some(x=>x.value==="LOBO_PRO_1_NORMAL")){
  lista.add(new Option("LOBO PRO 1 NORMAL","LOBO_PRO_1_NORMAL"));
 }
});
