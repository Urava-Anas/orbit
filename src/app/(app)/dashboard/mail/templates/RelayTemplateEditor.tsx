"use client";
import { useMemo, useState } from "react";
import { Plus, Save, Smartphone, Monitor, Trash2 } from "lucide-react";
import { saveRelayModule, saveRelayTemplate } from "./actions";
import styles from "./templates.module.css";

type Block={id:string;type:"heading"|"text"|"button"|"divider"|"spacer";content?:string;href?:string};
type Props={template?:{id:string;name:string;category:string;subject_template:string;current_version:number}|null;document?:{blocks:Block[]}|null;modules:{id:string;name:string;schema:{blocks?:Block[]}}[]};

const make=(type:Block["type"]):Block=>({id:crypto.randomUUID(),type,content:type==="heading"?"Your headline":type==="text"?"Write your message here.":type==="button"?"Continue":undefined,href:type==="button"?"https://":undefined});

export function RelayTemplateEditor({template,document,modules}:Props){
 const [name,setName]=useState(template?.name??"Untitled template");
 const [category,setCategory]=useState(template?.category??"proposal");
 const [subject,setSubject]=useState(template?.subject_template??"Proposal for {{lead.company}}");
 const [blocks,setBlocks]=useState<Block[]>(document?.blocks?.length?document.blocks:[make("heading"),make("text"),make("button")]);
 const [device,setDevice]=useState<"desktop"|"mobile">("desktop");
 const doc=useMemo(()=>JSON.stringify({blocks}),[blocks]);
 const update=(id:string,patch:Partial<Block>)=>setBlocks((all)=>all.map((b)=>b.id===id?{...b,...patch}:b));
 const add=(type:Block["type"])=>setBlocks((all)=>[...all,make(type)]);
 const addModule=(module:Props["modules"][number])=>setBlocks((all)=>[...all,...(module.schema.blocks??[]).map((b)=>({...b,id:crypto.randomUUID()}))]);
 return <div className={styles.shell}>
   <aside className={styles.library}>
    <h2>Blocks</h2><p>One schema powers editor, preview and HTML.</p>
    {(["heading","text","button","divider","spacer"] as const).map((type)=><button key={type} type="button" onClick={()=>add(type)}><Plus size={14}/>{type}</button>)}
    <h2>Modules</h2>
    {modules.map((m)=><button key={m.id} type="button" onClick={()=>addModule(m)}><Plus size={14}/>{m.name}</button>)}
   </aside>
   <section className={styles.editor}>
    <form action={saveRelayTemplate} className={styles.meta}>
      <input type="hidden" name="templateId" value={template?.id??""}/><input type="hidden" name="document" value={doc}/>
      <input name="name" value={name} onChange={(e)=>setName(e.target.value)} aria-label="Template name"/>
      <select name="category" value={category} onChange={(e)=>setCategory(e.target.value)}><option value="proposal">Proposal</option><option value="outreach">Outreach</option><option value="followup">Follow-up</option><option value="onboarding">Onboarding</option><option value="transactional">Transactional</option><option value="general">General</option></select>
      <input name="subject" value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Subject"/>
      <button type="submit"><Save size={14}/>Save version</button>
    </form>
    <div className={styles.canvas}>
      {blocks.map((block)=><article key={block.id} className={styles.block}>
       <div><b>{block.type}</b><button type="button" onClick={()=>setBlocks((all)=>all.filter((b)=>b.id!==block.id))}><Trash2 size={13}/></button></div>
       {["heading","text","button"].includes(block.type)?<textarea value={block.content??""} onChange={(e)=>update(block.id,{content:e.target.value})}/>:<span>{block.type}</span>}
       {block.type==="button"?<input value={block.href??""} onChange={(e)=>update(block.id,{href:e.target.value})} placeholder="https:// or {{variable}}"/>:null}
      </article>)}
    </div>
    <form action={saveRelayModule} className={styles.moduleSave}><input name="name" placeholder="Module name"/><input type="hidden" name="document" value={doc}/><button type="submit">Save current layout as module</button></form>
   </section>
   <aside className={styles.preview}>
    <div className={styles.previewBar}><strong>Responsive preview</strong><button type="button" onClick={()=>setDevice("desktop")}><Monitor size={15}/></button><button type="button" onClick={()=>setDevice("mobile")}><Smartphone size={15}/></button></div>
    <div className={device==="mobile"?styles.mobileFrame:styles.desktopFrame}>
      <small>{subject}</small>
      {blocks.map((b)=><div key={b.id}>{b.type==="heading"?<h2>{b.content}</h2>:b.type==="text"?<p>{b.content}</p>:b.type==="button"?<span className={styles.fakeButton}>{b.content}</span>:b.type==="divider"?<hr/>:<div style={{height:24}}/>}</div>)}
    </div>
    <div className={styles.variables}><strong>Merge variables</strong><code>{"{{lead.name}} {{lead.company}} {{lead.pain_point}} {{workspace.name}} {{proposal.title}} {{proposal.price}} {{proposal.currency}} {{proposal.scope}} {{invoice.amount}} {{project.name}} {{sender.name}}"}</code></div>
   </aside>
 </div>
}