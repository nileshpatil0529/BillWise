import{b as C,h as E}from"./chunk-CKID22FP.js";import{Ka as v,Sc as R,a as N,b as P,ca as T,e as p,h as w,ia as S,jb as g}from"./chunk-CQHUMVND.js";var I={"2inch":32,"3inch":48},A=class l{API_URL=`${E.apiUrl}/printer-config`;AGENT_URL="http://127.0.0.1:32145";http=S(C);platformId=S(v);isBrowser=R(this.platformId);config=g({printerName:null,paperSize:"3inch",enabled:!1});agentStatus=g("unchecked");availablePrinters=g([]);loadConfig(){return new w(e=>{this.http.get(this.API_URL).subscribe({next:n=>{if(n.success){let r={printerName:n.data.printerName,paperSize:n.data.paperSize||"3inch",enabled:!!n.data.enabled};this.config.set(r)}e.next(n),e.complete()},error:n=>e.error(n)})})}saveConfig(e){return this.http.put(this.API_URL,e)}connectAgent(){return p(this,null,function*(){if(this.isBrowser){this.agentStatus.set("loading");try{yield this.fetchAgent("/health"),this.agentStatus.set("connected"),yield this.refreshPrinters()}catch(e){throw this.agentStatus.set("disconnected"),new Error(e?.message||"BillWise Print Agent is not running")}}})}disconnectAgent(){this.agentStatus.set("disconnected")}refreshPrinters(){return p(this,null,function*(){try{let e=yield this.fetchAgent("/printers"),n=Array.isArray(e?.printers)?e.printers:[];return this.availablePrinters.set(n),n}catch(e){return console.error("Print Agent refreshPrinters error:",e),this.agentStatus.set("disconnected"),this.availablePrinters.set([]),[]}})}isReady(){return this.agentStatus()==="connected"&&this.config().enabled&&!!this.config().printerName}printReceipt(e,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let o=this.buildReceiptData(e,n,r.paperSize);yield this.sendRaw(r.printerName,o)})}printKOT(e,n){return p(this,null,function*(){let r=this.config();if(!r.printerName)throw new Error("No printer selected");let o=this.buildKOTData(e,n,r.paperSize);yield this.sendRaw(r.printerName,o)})}sendRaw(e,n){return p(this,null,function*(){let r=yield this.fetchAgent("/print",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({printerName:e,data:n})});if(!r?.success)throw new Error(r?.message||"Print failed")})}fetchAgent(e,n){return p(this,null,function*(){let r=yield fetch(`${this.AGENT_URL}${e}`,P(N({},n),{cache:"no-store"}));if(!r.ok)throw new Error(`Agent request failed (${r.status})`);return r.json()})}buildReceiptData(e,n,r){let o=I[r],i="\x1B",c="",h="-".repeat(o),y=n?.receiptLanguage==="hi",b=e.items||[],t="";t+=i+"@",t+=i+"a"+i+"E"+c+"!",t+=(n?.businessName||"My Business")+`
`,t+=c+"!\0"+i+`E\0
`,n?.address&&(t+=n.address+`
`),n?.taxNumber&&(t+="GST: "+n.taxNumber+`
`),n?.phone&&(t+="Ph: "+n.phone+`
`),t+=i+`a\0
`,t+="Date: "+new Date(e.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,t+="Bill: "+(e.billNumber||"").slice(-5)+`
`;let u=e.businessTypeData||{};u.tableNumber&&(t+="Table: "+u.tableNumber+`
`),t+=h+`
`;let a=o===32?14:20,f=o===32?4:6,m=o===32?8:10,x="Name".padEnd(a)+"Qty".padStart(f)+"Price".padStart(m);if(t+=x+`
`,b.forEach(s=>{let d=(y&&s.nameHi?s.nameHi:s.name)||"Unknown",D=s.isLooseItem?Number(s.quantity).toFixed(2):String(Math.round(s.quantity)),L=Number(s.unitPrice).toFixed(2),k=d.length>a?d.substring(0,a):d.padEnd(a);t+=k+D.padStart(f)+L.padStart(m)+`
`,d.length>a&&(t+=d.substring(a,a*2).padEnd(a)+`
`)}),t+=h+`
`,t+=this.rpad("Subtotal:","Rs."+Number(e.subtotal).toFixed(2),o)+`
`,e.taxTotal>0){let s=n?.taxRates?.[0]?.rate||0;t+=this.rpad(`Tax (${s}%):`,"Rs."+Number(e.taxTotal).toFixed(2),o)+`
`}if(e.discountTotal>0&&(t+=this.rpad("Discount:","-Rs."+Number(e.discountTotal).toFixed(2),o)+`
`),t+=i+"E",t+=this.rpad("Grand Total:","Rs."+Number(e.grandTotal).toFixed(2),o)+`
`,t+=i+"E\0",t+=h+`
`,(e.paymentMethod==="upi"||e.paymentMethod==="online")&&n?.upiId){let s=`upi://pay?pa=${n.upiId}&pn=${encodeURIComponent(n.businessName||"")}&am=${Number(e.grandTotal).toFixed(2)}&cu=INR`;t+=i+"a",t+=c+"(k\x001A2\0",t+=c+"(k\x001C",t+=c+"(k\x001E1";let d=s.length+3;t+=c+"(k"+String.fromCharCode(d%256,Math.floor(d/256),49,80,48)+s,t+=c+`(k\x001Q0
`}return t+=i+"a",n?.footerText&&(t+=n.footerText+`
`),t+=`
`,t+=c+"VA",t}buildKOTData(e,n,r){let o=I[r],i="\x1B",c="",h="-".repeat(o),y=n?.receiptLanguage==="hi",b=(e.items||[]).filter(a=>a.quantity>(a.kotPrintedQuantity||0)),t="";t+=i+"@",t+=i+"a"+i+"E"+c+"!",t+=`Kitchen Order
`,t+=c+"!\0"+i+`E\0
`,t+=i+"a\0",t+="Date: "+new Date().toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0})+`
`,t+="Bill: "+(e.billNumber||"").slice(-5)+`
`;let u=e.businessTypeData||{};if(u.tableNumber){let a=u.tableType==="parcel"?"Parcel":"Table";t+=a+": "+u.tableNumber+`
`}return t+=h+`
`,b.forEach(a=>{let f=(y&&a.nameHi?a.nameHi:a.name)||"Unknown",m=a.quantity-(a.kotPrintedQuantity||0),x=a.isLooseItem?Number(m).toFixed(2):String(Math.round(m)),s=a.note?" ["+a.note+"]":"";t+=f+" X "+x+s+`
`}),t+=h+`

`,t+=c+"VA",t}rpad(e,n,r){let o=e.length+n.length,i=Math.max(1,r-o);return e+" ".repeat(i)+n}static \u0275fac=function(n){return new(n||l)};static \u0275prov=T({token:l,factory:l.\u0275fac,providedIn:"root"})};export{A as a};
