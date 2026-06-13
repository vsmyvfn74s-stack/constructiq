/**
 * logTenderActivity
 *
 * Logs a structured event to the TenderActivity feed.
 * Can be called from the frontend or other backend functions.
 *
 * Payload:
 *   tenderId      string  (required)
 *   event_type    string  (required) — see TenderActivity entity enum
 *   description   string  (required)
 *   actor_name    string  (optional — defaults to current user or 'System')
 *   actor_email   string  (optional)
 *   metadata      object  (optional)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { tenderId, event_type, description, actor_name, actor_email, metadata } = body;

    if (!tenderId || !event_type || !description) {
      return Response.json({ error: 'tenderId, event_type, and description are required' }, { status: 400 });
    }

    // Try to get the current user; fall back to 'System' for automated calls
    let actorName = actor_name || 'System';
    let actorEmail = actor_email || '';
    try {
      const user = await base44.auth.me();
      if (user) {
        actorName = actor_name || user.full_name || user.email || 'System';
        actorEmail = actor_email || user.email || '';
      }
    } catch (_) {
      // Unauthenticated / automated call — use System
    }

    const record = await base44.asServiceRole.entities.TenderActivity.create({
      tender_id: tenderId,
      event_type,
      description,
      actor_name: actorName,
      actor_email: actorEmail,
      metadata: metadata || null,
      occurred_at: new Date().toISOString(),
    });

    return Response.json({ success: true, id: record.id });
  } catch (error) {
    console.error('[logTenderActivity] ERROR:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});