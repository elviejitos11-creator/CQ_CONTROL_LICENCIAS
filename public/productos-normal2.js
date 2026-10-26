
document.addEventListener("DOMContentLoaded",()=>{
 const lista=document.getElementById("producto");
 if(!lista)return;

 if(![...lista.options].some(x=>x.value==="LOBO_PRO_2_NORMAL")){
  lista.add(new Option("LOBO PRO 2 NORMAL","LOBO_PRO_2_NORMAL"));
 }
});
