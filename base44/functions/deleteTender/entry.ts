import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * deleteTender
 *
 * Cascading delete:
 *   TenderSubmission → TenderInvitation → TenderInvitee → Folder → Tender
 */
Deno.serve(async (req) => {
  const log = [];
  const trace = (msg) => { console.log(`[deleteTender] ${msg}`); log.push(msg); };
  const fail  = (msg, status = 500) => {
    console.error(`[deleteTender] FAIL: ${msg}`);
    return Response.json({ error: msg, trace: log }, { status });
  };

  try {
    trace('START');
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    let user;
    try {
      user = await base44.auth.me();
      trace(`auth: email=${user?.email} role=${user?.role}`);
    } catch (e) { return fail(`Auth error: ${e.message}`, 401); }

    if (!user) return fail('Unauthorized', 401);
    if (!['admin', 'pricing'].includes(user.role)) {
      return fail(`Forbidden — role '${user.role}'`, 403);
    }

    let body;
    try { body = await req.json(); }
    catch (e) { return fail(`Invalid body: ${e.message}`, 400); }

    const { tenderId } = body;
    if (!tenderId) return fail('tenderId is required', 400);
    trace(`DELETE tender=${tenderId}`);

    const fetchAll = async (entityName, filter) => {
      const records = await sr.entities[entityName].filter(filter);
      trace(`${entityName} count: ${records.length}`);
      return records;
    };

    const deleteAll = async (entityName, records) => {
      for (const r of records) {
        try {
          await sr.entities[entityName].delete(r.id);
        } catch (e) {
          trace(`${entityName} delete FAILED id=${r.id}: ${e.message}`);
        }
      }
      trace(`${entityName} — ${records.length} deleted`);
    };

    // Step 1 — TenderSubmission
    const submissions = await fetchAll('TenderSubmission', { tender_id: tenderId });
    await deleteAll('TenderSubmission', submissions);

    // Step 2 — TenderInvitation
    const invitations = await fetchAll('TenderInvitation', { tender_id: tenderId });
    await deleteAll('TenderInvitation', invitations);

    // Step 3 — TenderInvitee
    const invitees = await fetchAll('TenderInvitee', { tender_id: tenderId });
    await deleteAll('TenderInvitee', invitees);

    // Step 4 — Folder
    const folders = await fetchAll('Folder', { tender_id: tenderId });
    await deleteAll('Folder', folders);

    // Step 5 — Tender (user-scoped to bypass RLS quirk on delete)
    trace(`Deleting Tender id=${tenderId}...`);
    await base44.entities.Tender.delete(tenderId);
    trace('Tender deleted');

    trace('DELETE COMPLETE');
    return Response.json({ success: true, trace: log });

  } catch (error) {
    console.error('[deleteTender] UNHANDLED:', error.message, error.stack);
    return Response.json({ error: error.message, stack: error.stack, trace: log }, { status: 500 });
  }
});