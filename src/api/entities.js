/**
 * entities.js
 *
 * Drop-in replacement for base44.entities.X calls.
 * Each entity exposes: list(), filter(match), get(id), create(data), update(id, data), delete(id)
 *
 * Usage (same pattern as before, just different import):
 *   import { Project } from '@/api/entities';
 *   const projects = await Project.list();
 *   const project = await Project.get(id);
 *   await Project.create({ name: 'New Project' });
 *   await Project.update(id, { status: 'Complete' });
 *   await Project.delete(id);
 */

import { supabase } from '@/api/supabaseClient';

function entity(table) {
  return {
    async list() {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    async filter(match) {
      let query = supabase.from(table).select('*');
      Object.entries(match).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  };
}

export const User                      = entity('users');
export const Project                   = entity('projects');
export const Task                      = entity('tasks');
export const RFI                       = entity('rfis');
export const Document                  = entity('documents');
export const Folder                    = entity('folders');
export const Tender                    = entity('tenders');
export const TenderInvitee             = entity('tender_invitees');
export const TenderInvitation          = entity('tender_invitations');
export const TenderSubmission          = entity('tender_submissions');
export const TenderActivity            = entity('tender_activities');
export const TenderContact             = entity('tender_contacts');
export const TenderCounter             = entity('tender_counter');
export const TenderSettings            = entity('tender_settings');
export const InvitedUser               = entity('invited_users');
export const PendingProjectAssignment  = entity('pending_project_assignments');
export const ProjectRole               = entity('project_roles');
export const AuditLog                  = entity('audit_logs');
export const EmailBranding             = entity('email_branding');
export const EmailTemplate             = entity('email_templates');
export const DocumentFolderTemplate    = entity('document_folder_templates');
