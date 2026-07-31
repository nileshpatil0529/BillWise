import{b as T,i as l}from"./chunk-Z3AOYP47.js";import{La as z,_c as N,da as P,e as p,h as w,ja as q,lb as y}from"./chunk-3GH7UMO7.js";var C={"2inch":32,"3inch":48},v=class g{API_URL=`${l.apiUrl}/printer-config`;http=q(T);platformId=q(z);isBrowser=N(this.platformId);config=y({printerName:null,paperSize:"3inch",enabled:!1});qzStatus=y("unchecked");availablePrinters=y([]);loadConfig(){return new w(t=>{this.http.get(this.API_URL).subscribe({next:n=>{if(n.success){let r={printerName:n.data.printerName,paperSize:n.data.paperSize||"3inch",enabled:!!n.data.enabled};this.config.set(r)}t.next(n),t.complete()},error:n=>t.error(n)})})}saveConfig(t){return this.http.put(this.API_URL,t)}loadQZScript(){return p(this,null,function*(){if(this.isBrowser&&!(typeof qz<"u"))return new Promise((t,n)=>{if(document.querySelector("script[data-qz]")){t();return}let a=document.createElement("script");a.setAttribute("data-qz","true"),a.src="https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js",a.onload=()=>t(),a.onerror=()=>n(new Error("Failed to load QZ Tray library")),document.head.appendChild(a)})})}connectQZ(){return p(this,null,function*(){this.qzStatus.set("loading");try{yield this.loadQZScript(),qz.security.setCertificatePromise((t,n)=>{fetch(`${l.apiUrl}/qz/cert`,{cache:"no-store"}).then(r=>r.ok?r.text():Promise.reject(r.statusText)).then(t).catch(n)}),qz.security.setSignatureAlgorithm("SHA512"),qz.security.setSignaturePromise(t=>(n,r)=>{fetch(`${l.apiUrl}/qz/sign?request=${encodeURIComponent(t)}`,{cache:"no-store",headers:{"Content-Type":"text/plain"}}).then(a=>a.ok?a.text():Promise.reject(a.statusText)).then(n).catch(r)}),qz.websocket.isActive()||(yield qz.websocket.connect()),this.qzStatus.set("connected"),yield this.refreshPrinters()}catch(t){throw this.qzStatus.set("disconnected"),new Error(t?.message||"QZ Tray is not running")}})}disconnectQZ(){return p(this,null,function*(){try{typeof qz<"u"&&qz.websocket.isActive()&&(yield qz.websocket.disconnect())}catch{}this.qzStatus.set("disconnected")})}refreshPrinters(){return p(this,null,function*(){try{let t=yield qz.printers.find(),n=Array.isArray(t)?t:t?[t]:[];if(n.length===0)try{let r=yield qz.printers.getDefault();r&&n.push(r)}catch{}return this.availablePrinters.set(n),n}catch(t){return console.error("QZ Tray refreshPrinters error:",t),this.availablePrinters.set([]),[]}})}isReady(){return this.qzStatus()==="connected"&&this.config().enabled&&!!this.config().printerName}printReceipt(t,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let a=this.buildReceiptData(t,n,r.paperSize);yield this.sendRaw(r.printerName,a)})}printKOT(t,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let a=this.buildKOTData(t,n,r.paperSize);yield this.sendRaw(r.printerName,a)})}sendRaw(t,n){return p(this,null,function*(){let r=qz.configs.create(t);yield qz.print(r,[{type:"raw",format:"command",data:n}])})}buildReceiptData(t,n,r){let a=C[r],o="\x1B",c="",u="-".repeat(a),x=n?.receiptLanguage==="hi",b=t.items||[],e="";e+=o+"@",e+=o+"a"+o+"E"+c+"!",e+=(n?.businessName||"My Business")+`
`,e+=c+"!\0"+o+`E\0
`,n?.address&&(e+=n.address+`
`),n?.taxNumber&&(e+="GST: "+n.taxNumber+`
`),n?.phone&&(e+="Ph: "+n.phone+`
`),e+=o+`a\0
`,e+="Date: "+new Date(t.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,e+="Bill: "+(t.billNumber||"").slice(-5)+`
`;let h=t.businessTypeData||{};h.tableNumber&&(e+="Table: "+h.tableNumber+`
`),e+=u+`
`;let i=a===32?14:20,f=a===32?4:6,m=a===32?8:10,S="Name".padEnd(i)+"Qty".padStart(f)+"Price".padStart(m);if(e+=S+`
`,b.forEach(s=>{let d=(x&&s.nameHi?s.nameHi:s.name)||"Unknown",I=s.isLooseItem?Number(s.quantity).toFixed(2):String(Math.round(s.quantity)),R=Number(s.unitPrice).toFixed(2),E=d.length>i?d.substring(0,i):d.padEnd(i);e+=E+I.padStart(f)+R.padStart(m)+`
`,d.length>i&&(e+=d.substring(i,i*2).padEnd(i)+`
`)}),e+=u+`
`,e+=this.rpad("Subtotal:","Rs."+Number(t.subtotal).toFixed(2),a)+`
`,t.taxTotal>0){let s=n?.taxRates?.[0]?.rate||0;e+=this.rpad(`Tax (${s}%):`,"Rs."+Number(t.taxTotal).toFixed(2),a)+`
`}if(t.discountTotal>0&&(e+=this.rpad("Discount:","-Rs."+Number(t.discountTotal).toFixed(2),a)+`
`),e+=o+"E",e+=this.rpad("Grand Total:","Rs."+Number(t.grandTotal).toFixed(2),a)+`
`,e+=o+"E\0",e+=u+`
`,(t.paymentMethod==="upi"||t.paymentMethod==="online")&&n?.upiId){let s=`upi://pay?pa=${n.upiId}&pn=${encodeURIComponent(n.businessName||"")}&am=${Number(t.grandTotal).toFixed(2)}&cu=INR`;e+=o+"a",e+=c+"(k\x001A2\0",e+=c+"(k\x001C",e+=c+"(k\x001E1";let d=s.length+3;e+=c+"(k"+String.fromCharCode(d%256,Math.floor(d/256),49,80,48)+s,e+=c+`(k\x001Q0
`}return e+=o+"a",n?.footerText&&(e+=n.footerText+`
`),e+=`
`,e+=c+"VA",e}buildKOTData(t,n,r){let a=C[r],o="\x1B",c="",u="-".repeat(a),x=n?.receiptLanguage==="hi",b=(t.items||[]).filter(i=>i.quantity>(i.kotPrintedQuantity||0)),e="";e+=o+"@",e+=o+"a"+o+"E"+c+"!",e+=`Kitchen Order
`,e+=c+"!\0"+o+`E\0
`,e+=o+"a\0",e+="Date: "+new Date().toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,e+="Bill: "+(t.billNumber||"").slice(-5)+`
`;let h=t.businessTypeData||{};if(h.tableNumber){let i=h.tableType==="parcel"?"Parcel":"Table";e+=i+": "+h.tableNumber+`
`}return e+=u+`
`,b.forEach(i=>{let f=(x&&i.nameHi?i.nameHi:i.name)||"Unknown",m=i.quantity-(i.kotPrintedQuantity||0),S=i.isLooseItem?Number(m).toFixed(2):String(Math.round(m)),s=i.note?" ["+i.note+"]":"";e+=f+" X "+S+s+`
`}),e+=u+`

`,e+=c+"VA",e}rpad(t,n,r){let a=t.length+n.length,o=Math.max(1,r-a);return t+" ".repeat(o)+n}static \u0275fac=function(n){return new(n||g)};static \u0275prov=P({token:g,factory:g.\u0275fac,providedIn:"root"})};export{v as a};
