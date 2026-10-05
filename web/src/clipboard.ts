export async function copyText(value:string){
 if(navigator.clipboard){try{await navigator.clipboard.writeText(value);return;}catch{/* Try selection-based copy where clipboard permission is unavailable. */}}
 const previous=document.activeElement as HTMLElement|null;
 const input=document.createElement('textarea');input.value=value;input.setAttribute('readonly','');input.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(input);
 try{input.select();input.setSelectionRange(0,value.length);if(!document.execCommand('copy'))throw Error('复制失败');}finally{input.remove();previous?.focus();}
}
