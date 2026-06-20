import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Drop-in replacement for base44.functions.invoke(name, payload)
export async function invokeFunction(name, payload = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) throw error;
  return { data };
}

// Drop-in replacement for base44.integrations.Core.UploadFile({ file })
export async function uploadFile(file, bucket = 'documents') {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { file_url: data.publicUrl };
}

// Drop-in replacement for base44.integrations.Core.SendEmail(...)
export async function sendEmail({ to, toName, subject, body, htmlBody }) {
  return invokeFunction('sendEmail', { to, toName, subject, htmlBody: htmlBody || body });
}
