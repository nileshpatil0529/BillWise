import{b as N,i as v}from"./chunk-Z3AOYP47.js";import{La as q,_c as z,da as P,e as p,h as w,ja as S,lb as y}from"./chunk-3GH7UMO7.js";var T={"2inch":32,"3inch":48},C=class l{API_URL=`${v.apiUrl}/printer-config`;http=S(N);platformId=S(q);isBrowser=z(this.platformId);config=y({printerName:null,paperSize:"3inch",enabled:!1});qzStatus=y("unchecked");availablePrinters=y([]);loadConfig(){return new w(e=>{this.http.get(this.API_URL).subscribe({next:n=>{if(n.success){let i={printerName:n.data.printerName,paperSize:n.data.paperSize||"3inch",enabled:!!n.data.enabled};this.config.set(i)}e.next(n),e.complete()},error:n=>e.error(n)})})}saveConfig(e){return this.http.put(this.API_URL,e)}loadQZScript(){return p(this,null,function*(){if(this.isBrowser&&!(typeof qz<"u"))return new Promise((e,n)=>{if(document.querySelector("script[data-qz]")){e();return}let r=document.createElement("script");r.setAttribute("data-qz","true"),r.src="https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js",r.onload=()=>e(),r.onerror=()=>n(new Error("Failed to load QZ Tray library")),document.head.appendChild(r)})})}connectQZ(){return p(this,null,function*(){this.qzStatus.set("loading");try{yield this.loadQZScript(),qz.security.setCertificatePromise((e,n)=>n("")),qz.security.setSignaturePromise((e,n)=>n("")),qz.websocket.isActive()||(yield qz.websocket.connect()),this.qzStatus.set("connected"),yield this.refreshPrinters()}catch(e){throw this.qzStatus.set("disconnected"),new Error(e?.message||"QZ Tray is not running")}})}disconnectQZ(){return p(this,null,function*(){try{typeof qz<"u"&&qz.websocket.isActive()&&(yield qz.websocket.disconnect())}catch{}this.qzStatus.set("disconnected")})}refreshPrinters(){return p(this,null,function*(){try{let e=yield qz.printers.find(),n=Array.isArray(e)?e:e?[e]:[];if(n.length===0)try{let i=yield qz.printers.getDefault();i&&n.push(i)}catch{}return this.availablePrinters.set(n),n}catch(e){return console.error("QZ Tray refreshPrinters error:",e),this.availablePrinters.set([]),[]}})}isReady(){return this.qzStatus()==="connected"&&this.config().enabled&&!!this.config().printerName}printReceipt(e,n){return p(this,null,function*(){let i=this.config();if(!i.printerName)throw new Error("No printer selected");let r=this.buildReceiptData(e,n,i.paperSize);yield this.sendRaw(i.printerName,r)})}printKOT(e,n){return p(this,null,function*(){let i=this.config();if(!i.printerName)throw new Error("No printer selected");let r=this.buildKOTData(e,n,i.paperSize);yield this.sendRaw(i.printerName,r)})}sendRaw(e,n){return p(this,null,function*(){let i=qz.configs.create(e);yield qz.print(i,[{type:"raw",format:"command",data:n}])})}buildReceiptData(e,n,i){let r=T[i],o="\x1B",c="",u="-".repeat(r),g=n?.receiptLanguage==="hi",b=e.items||[],t="";t+=o+"@",t+=o+"a"+o+"E"+c+"!",t+=(n?.businessName||"My Business")+`
`,t+=c+"!\0"+o+`E\0
`,n?.address&&(t+=n.address+`
`),n?.taxNumber&&(t+="GST: "+n.taxNumber+`
`),n?.phone&&(t+="Ph: "+n.phone+`
`),t+=o+`a\0
`,t+="Date: "+new Date(e.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,t+="Bill: "+(e.billNumber||"").slice(-5)+`
`;let m=e.businessTypeData||{};m.tableNumber&&(t+="Table: "+m.tableNumber+`
`),t+=u+`
`;let a=r===32?14:20,f=r===32?4:6,h=r===32?8:10,x="Name".padEnd(a)+"Qty".padStart(f)+"Price".padStart(h);if(t+=x+`
`,b.forEach(s=>{let d=(g&&s.nameHi?s.nameHi:s.name)||"Unknown",E=s.isLooseItem?Number(s.quantity).toFixed(2):String(Math.round(s.quantity)),I=Number(s.unitPrice).toFixed(2),R=d.length>a?d.substring(0,a):d.padEnd(a);t+=R+E.padStart(f)+I.padStart(h)+`
`,d.length>a&&(t+=d.substring(a,a*2).padEnd(a)+`
`)}),t+=u+`
`,t+=this.rpad("Subtotal:","Rs."+Number(e.subtotal).toFixed(2),r)+`
`,e.taxTotal>0){let s=n?.taxRates?.[0]?.rate||0;t+=this.rpad(`Tax (${s}%):`,"Rs."+Number(e.taxTotal).toFixed(2),r)+`
`}if(e.discountTotal>0&&(t+=this.rpad("Discount:","-Rs."+Number(e.discountTotal).toFixed(2),r)+`
`),t+=o+"E",t+=this.rpad("Grand Total:","Rs."+Number(e.grandTotal).toFixed(2),r)+`
`,t+=o+"E\0",t+=u+`
`,(e.paymentMethod==="upi"||e.paymentMethod==="online")&&n?.upiId){let s=`upi://pay?pa=${n.upiId}&pn=${encodeURIComponent(n.businessName||"")}&am=${Number(e.grandTotal).toFixed(2)}&cu=INR`;t+=o+"a",t+=c+"(k\x001A2\0",t+=c+"(k\x001C",t+=c+"(k\x001E1";let d=s.length+3;t+=c+"(k"+String.fromCharCode(d%256,Math.floor(d/256),49,80,48)+s,t+=c+`(k\x001Q0
`}return t+=o+"a",n?.footerText&&(t+=n.footerText+`
`),t+=`
`,t+=c+"VA",t}buildKOTData(e,n,i){let r=T[i],o="\x1B",c="",u="-".repeat(r),g=n?.receiptLanguage==="hi",b=(e.items||[]).filter(a=>a.quantity>(a.kotPrintedQuantity||0)),t="";t+=o+"@",t+=o+"a"+o+"E"+c+"!",t+=`Kitchen Order
`,t+=c+"!\0"+o+`E\0
`,t+=o+"a\0",t+="Date: "+new Date().toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,t+="Bill: "+(e.billNumber||"").slice(-5)+`
`;let m=e.businessTypeData||{};if(m.tableNumber){let a=m.tableType==="parcel"?"Parcel":"Table";t+=a+": "+m.tableNumber+`
`}return t+=u+`
`,b.forEach(a=>{let f=(g&&a.nameHi?a.nameHi:a.name)||"Unknown",h=a.quantity-(a.kotPrintedQuantity||0),x=a.isLooseItem?Number(h).toFixed(2):String(Math.round(h)),s=a.note?" ["+a.note+"]":"";t+=f+" X "+x+s+`
`}),t+=u+`

`,t+=c+"VA",t}rpad(e,n,i){let r=e.length+n.length,o=Math.max(1,i-r);return e+" ".repeat(o)+n}static \u0275fac=function(n){return new(n||l)};static \u0275prov=P({token:l,factory:l.\u0275fac,providedIn:"root"})};export{C as a};
