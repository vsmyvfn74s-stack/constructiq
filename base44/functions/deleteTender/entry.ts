import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * deleteTender
 *
 * Cascading delete: TenderInvitation → Folder → Tender
 * All operations via service role to bypass entity RLS.
 */
Deno.serve(async (req) => {
  const log = [];
  const trace = (msg) => { console.log(`[deleteTender] ${msg}`); log.push(msg); };
  const fail = (msg, status = 500) => {
    console.error(`[deleteTender] FAIL: ${msg}`);
    return Response.json({ error: msg, trace: log }, { status });
  };

  try {
    trace('START');

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    trace('SDK initialised');

    // ── Auth ──────────────────────────────────────────────────────────────────
    let user;
    try {
      user = await base44.auth.me();
      trace(`auth.me: email=${user?.email} role=${user?.role}`);
    } catch (e) {
      return fail(`Auth error: ${e.message}`, 401);
    }

    if (!user) return fail('Unauthorized', 401);
    if (!['admin', 'pricing'].includes(user.role)) {
      return fail(`Forbidden — role '${user.role}' not permitted`, 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return fail(`Invalid body: ${e.message}`, 400);
    }

    const { tenderId } = body;
    if (!tenderId) return fail('tenderId is required', 400);
    trace(`DELETE tender id=${tenderId}`);

    // Step 1 — Delete all TenderInvitation records
    trace('Fetching TenderInvitation records...');
    let invitations;
    try {
      invitations = await sr.entities.TenderInvitation.filter({ tender_id: tenderId });
      trace(`TenderInvitation count: ${invitations.length}`);
    } catch (e) {
      return fail(`TenderInvitation fetch failed: ${e.message}`);
    }

    for (const inv of invitations) {
      trace(`Deleting TenderInvitation id=${inv.id}`);
      try {
        await sr.entities.TenderInvitation.delete(inv.id);
        trace(`TenderInvitation id=${inv.id} deleted`);
      } catch (e) {
        return fail(`TenderInvitation delete failed id=${inv.id}: ${e.message}`);
      }
    }
    trace(`All ${invitations.length} TenderInvitation(s) deleted`);

    // Step 2 — Delete Folder records
    trace('Fetching Folder records...');
    let folders = [];
    try {
      folders = await sr.entities.Folder.filter({ tender_id: tenderId });
      trace(`Folder count: ${folders.length}`);
    } catch (e) {
      trace(`Folder.filter failed (non-fatal): ${e.message}`);
    }

    for (const folder of folders) {
      try {
        await sr.entities.Folder.delete(folder.id);
      } catch (e) {
        trace(`Folder delete failed id=${folder.id} (non-fatal): ${e.message}`);
      }
    }
    trace(`All ${folders.length} Folder(s) deleted`);

    // Step 3 — Delete the Tender record
    trace(`Deleting Tender id=${tenderId}...`);
    try {
      await sr.entities.Tender.delete(tenderId);
      trace(`Tender id=${tenderId} deleted`);
    } catch (e) {
      return fail(`Tender delete failed: ${e.message}`);
    }

    trace('DELETE COMPLETE');
    return Response.json({ success: true, trace: log });

  } catch (error) {
    console.error('[deleteTender] UNHANDLED:', error.message, error.stack);
    return Response.json({ error: error.message, stack: error.stack, trace: log }, { status: 500 });
  }
});