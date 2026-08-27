import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/workspace";
import { RelayTemplateEditor } from "./RelayTemplateEditor";
import styles from "./templates.module.css";

export const metadata:Metadata={title:"Relay Templates · Orbit",robots:{index:false,follow:false}};
type Props={searchParams:Promise<{id?:string;error?:string;notice?:string}>};

export default async function RelayTemplatesPage({searchParams}:Props){
 const params=await searchParams;
 const {supabase,workspace}=await requireWorkspace();
 const [{data:templates},{data:modules}]=await Promise.all([
  supabase.from("relay_templates").select("id,name,category,subject_template,current_version,status,updated_at").eq("workspace_id",workspace.id).order("updated_at",{ascending:false}),
  supabase.from("relay_modules").select("id,name,schema").eq("workspace_id",workspace.id).order("updated_at",{ascending:false})
 ]);
 const selected=(templates??[]).find((t)=>t.id===params.id)??null;
 const {data:version}=selected?await supabase.from("relay_template_versions").select("schema,version,variable_keys").eq("workspace_id",workspace.id).eq("template_id",selected.id).eq("version",selected.current_version).maybeSingle():{data:null};
 return <main className={styles.page}>
  <header className={styles.header}><div><Link href="/dashboard/mail?view=templates"><ArrowLeft size={14}/>Relay</Link><h1>Template Studio</h1><p>Build once. Render, version and reuse everywhere Relay communicates.</p></div><Link href="/dashboard/mail/templates"><Plus size={15}/>New template</Link></header>
  <Notice error={params.error} notice={params.notice}/>
  <nav className={styles.templates}>{(templates??[]).map((t)=><Link key={t.id} href={`/dashboard/mail/templates?id=${t.id}`} className={selected?.id===t.id?styles.active:""}><strong>{t.name}</strong><span>{t.category} · v{t.current_version}</span></Link>)}</nav>
  <RelayTemplateEditor template={selected} document={(version?.schema as {blocks:never[]}|null)??null} modules={(modules??[]) as never[]}/>
 </main>;
}