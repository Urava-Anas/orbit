"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { relayVariableKeys, type RelayTemplateSchema } from "@/lib/relay/template-renderer";

const schema = z.object({
  templateId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  subject: z.string().max(240),
  document: z.string().min(2).max(100000),
});

export async function saveRelayTemplate(formData: FormData) {
  const parsed=schema.safeParse({
    templateId:String(formData.get("templateId")??""),
    name:String(formData.get("name")??""),
    category:String(formData.get("category")??"general"),
    subject:String(formData.get("subject")??""),
    document:String(formData.get("document")??""),
  });
  if(!parsed.success) redirect("/dashboard/mail/templates?error=Invalid+template");
  const {supabase,workspace,user,role}=await requireWorkspace();
  if(!["owner","admin","founder"].includes(role)) redirect("/dashboard/mail/templates?error=Admin+authority+required");
  let document:RelayTemplateSchema;
  try { document=JSON.parse(parsed.data.document) as RelayTemplateSchema; }
  catch { redirect("/dashboard/mail/templates?error=Invalid+template+document"); }
  if(!Array.isArray(document.blocks)) redirect("/dashboard/mail/templates?error=Template+blocks+missing");
  const variables=relayVariableKeys(parsed.data.subject+" "+JSON.stringify(document));
  let templateId=parsed.data.templateId || "";
  let version=1;
  if(templateId){
    const {data:current,error}=await supabase.from("relay_templates").select("current_version").eq("workspace_id",workspace.id).eq("id",templateId).single();
    if(error) redirect("/dashboard/mail/templates?error=Template+not+found");
    version=Number(current.current_version)+1;
    const {error:updateError}=await supabase.from("relay_templates").update({
      name:parsed.data.name,category:parsed.data.category,subject_template:parsed.data.subject,current_version:version,updated_at:new Date().toISOString()
    }).eq("workspace_id",workspace.id).eq("id",templateId);
    if(updateError) redirect(`/dashboard/mail/templates?error=${encodeURIComponent(updateError.message)}`);
  } else {
    const {data:created,error}=await supabase.from("relay_templates").insert({
      workspace_id:workspace.id,name:parsed.data.name,category:parsed.data.category,subject_template:parsed.data.subject,created_by:user.id
    }).select("id").single();
    if(error) redirect(`/dashboard/mail/templates?error=${encodeURIComponent(error.message)}`);
    templateId=created.id;
  }
  const {error:versionError}=await supabase.from("relay_template_versions").insert({
    workspace_id:workspace.id,template_id:templateId,version,schema:document,variable_keys:variables,created_by:user.id
  });
  if(versionError) redirect(`/dashboard/mail/templates?error=${encodeURIComponent(versionError.message)}`);
  redirect(`/dashboard/mail/templates?id=${templateId}&notice=Saved+version+${version}`);
}

export async function activateRelayTemplate(formData:FormData){
  const templateId=String(formData.get("templateId")??"").trim();
  if(!z.string().uuid().safeParse(templateId).success) redirect("/dashboard/mail/templates?error=Invalid+template");
  const {supabase,workspace,role}=await requireWorkspace();
  if(!["owner","admin","founder"].includes(role)) redirect("/dashboard/mail/templates?error=Admin+authority+required");
  const {data:template,error:loadError}=await supabase.from("relay_templates").select("current_version").eq("workspace_id",workspace.id).eq("id",templateId).single();
  if(loadError||!template) redirect("/dashboard/mail/templates?error=Template+not+found");
  const {data:version,error:versionError}=await supabase.from("relay_template_versions").select("id").eq("workspace_id",workspace.id).eq("template_id",templateId).eq("version",template.current_version).maybeSingle();
  if(versionError||!version) redirect(`/dashboard/mail/templates?id=${templateId}&error=Save+a+version+before+activation`);
  const {error}=await supabase.from("relay_templates").update({status:"active",updated_at:new Date().toISOString()}).eq("workspace_id",workspace.id).eq("id",templateId);
  if(error) redirect(`/dashboard/mail/templates?id=${templateId}&error=${encodeURIComponent(error.message)}`);
  redirect(`/dashboard/mail/templates?id=${templateId}&notice=Template+activated`);
}

export async function saveRelayModule(formData:FormData){
  const name=String(formData.get("name")??"").trim();
  const document=String(formData.get("document")??"");
  if(name.length<2) redirect("/dashboard/mail/templates?error=Module+name+required");
  const {supabase,workspace,user,role}=await requireWorkspace();
  if(!["owner","admin","founder"].includes(role)) redirect("/dashboard/mail/templates?error=Admin+authority+required");
  let parsed:unknown;
  try{parsed=JSON.parse(document);}catch{redirect("/dashboard/mail/templates?error=Invalid+module");}
  const {error}=await supabase.from("relay_modules").upsert({
    workspace_id:workspace.id,name,module_type:"custom",schema:parsed,created_by:user.id,updated_at:new Date().toISOString()
  },{onConflict:"workspace_id,name"});
  if(error) redirect(`/dashboard/mail/templates?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard/mail/templates?notice=Reusable+module+saved");
}