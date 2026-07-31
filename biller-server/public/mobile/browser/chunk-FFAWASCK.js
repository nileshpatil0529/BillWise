import{b as N,h as v}from"./chunk-CKID22FP.js";import{Ka as q,Sc as z,ca as P,e as p,h as w,ia as S,jb as y}from"./chunk-CQHUMVND.js";var T={"2inch":32,"3inch":48},C=class l{API_URL=`${v.apiUrl}/printer-config`;http=S(N);platformId=S(q);isBrowser=z(this.platformId);config=y({printerName:null,paperSize:"3inch",enabled:!1});qzStatus=y("unchecked");availablePrinters=y([]);loadConfig(){return new w(t=>{this.http.get(this.API_URL).subscribe({next:n=>{if(n.success){let r={printerName:n.data.printerName,paperSize:n.data.paperSize||"3inch",enabled:!!n.data.enabled};this.config.set(r)}t.next(n),t.complete()},error:n=>t.error(n)})})}saveConfig(t){return this.http.put(this.API_URL,t)}loadQZScript(){return p(this,null,function*(){if(this.isBrowser&&!(typeof qz<"u"))return new Promise((t,n)=>{if(document.querySelector("script[data-qz]")){t();return}let a=document.createElement("script");a.setAttribute("data-qz","true"),a.src="https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js",a.onload=()=>t(),a.onerror=()=>n(new Error("Failed to load QZ Tray library")),document.head.appendChild(a)})})}connectQZ(){return p(this,null,function*(){this.qzStatus.set("loading");try{yield this.loadQZScript(),qz.security.setCertificatePromise(t=>t("")),qz.security.setSignaturePromise((t,n)=>{n(r=>r(""))}),qz.websocket.isActive()||(yield qz.websocket.connect()),this.qzStatus.set("connected"),yield this.refreshPrinters()}catch(t){throw this.qzStatus.set("disconnected"),new Error(t?.message||"QZ Tray is not running")}})}disconnectQZ(){return p(this,null,function*(){try{typeof qz<"u"&&qz.websocket.isActive()&&(yield qz.websocket.disconnect())}catch{}this.qzStatus.set("disconnected")})}refreshPrinters(){return p(this,null,function*(){try{let t=yield qz.printers.find(),n=Array.isArray(t)?t:t?[t]:[];if(n.length===0)try{let r=yield qz.printers.getDefault();r&&n.push(r)}catch{}return this.availablePrinters.set(n),n}catch(t){return console.error("QZ Tray refreshPrinters error:",t),this.availablePrinters.set([]),[]}})}isReady(){return this.qzStatus()==="connected"&&this.config().enabled&&!!this.config().printerName}printReceipt(t,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let a=this.buildReceiptData(t,n,r.paperSize);yield this.sendRaw(r.printerName,a)})}printKOT(t,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let a=this.buildKOTData(t,n,r.paperSize);yield this.sendRaw(r.printerName,a)})}sendRaw(t,n){return p(this,null,function*(){let r=qz.configs.create(t);yield qz.print(r,[{type:"raw",format:"command",data:n}])})}buildReceiptData(t,n,r){let a=T[r],o="\x1B",c="",u="-".repeat(a),g=n?.receiptLanguage==="hi",b=t.items||[],e="";e+=o+"@",e+=o+"a"+o+"E"+c+"!",e+=(n?.businessName||"My Business")+`
`,e+=c+"!\0"+o+`E\0
`,n?.address&&(e+=n.address+`
`),n?.taxNumber&&(e+="GST: "+n.taxNumber+`
`),n?.phone&&(e+="Ph: "+n.phone+`
`),e+=o+`a\0
`,e+="Date: "+new Date(t.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,e+="Bill: "+(t.billNumber||"").slice(-5)+`
`;let m=t.businessTypeData||{};m.tableNumber&&(e+="Table: "+m.tableNumber+`
`),e+=u+`
`;let i=a===32?14:20,f=a===32?4:6,h=a===32?8:10,x="Name".padEnd(i)+"Qty".padStart(f)+"Price".padStart(h);if(e+=x+`
`,b.forEach(s=>{let d=(g&&s.nameHi?s.nameHi:s.name)||"Unknown",E=s.isLooseItem?Number(s.quantity).toFixed(2):String(Math.round(s.quantity)),I=Number(s.unitPrice).toFixed(2),R=d.length>i?d.substring(0,i):d.padEnd(i);e+=R+E.padStart(f)+I.padStart(h)+`
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
`,e+=c+"VA",e}buildKOTData(t,n,r){let a=T[r],o="\x1B",c="",u="-".repeat(a),g=n?.receiptLanguage==="hi",b=(t.items||[]).filter(i=>i.quantity>(i.kotPrintedQuantity||0)),e="";e+=o+"@",e+=o+"a"+o+"E"+c+"!",e+=`Kitchen Order
`,e+=c+"!\0"+o+`E\0
`,e+=o+"a\0",e+="Date: "+new Date().toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,e+="Bill: "+(t.billNumber||"").slice(-5)+`
`;let m=t.businessTypeData||{};if(m.tableNumber){let i=m.tableType==="parcel"?"Parcel":"Table";e+=i+": "+m.tableNumber+`
`}return e+=u+`
`,b.forEach(i=>{let f=(g&&i.nameHi?i.nameHi:i.name)||"Unknown",h=i.quantity-(i.kotPrintedQuantity||0),x=i.isLooseItem?Number(h).toFixed(2):String(Math.round(h)),s=i.note?" ["+i.note+"]":"";e+=f+" X "+x+s+`
`}),e+=u+`

`,e+=c+"VA",e}rpad(t,n,r){let a=t.length+n.length,o=Math.max(1,r-a);return t+" ".repeat(o)+n}static \u0275fac=function(n){return new(n||l)};static \u0275prov=P({token:l,factory:l.\u0275fac,providedIn:"root"})};export{C as a};
