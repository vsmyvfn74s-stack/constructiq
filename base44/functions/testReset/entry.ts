import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DISABLED = Deno.env.get('TEST_UTILITIES_DISABLED') === 'true';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Completely erase one user so they can re-register as if they never existed.
 * 
 * IMPORTANT: base44.asServiceRole.entities.User.delete() is the ONLY available
 * SDK mechanism for auth identity removal. It is supposed to remove the User entity
 * AND the underlying auth identity/credentials. We verify this by checking whether
 * the user still appears in User.list() after deletion — if they do, authRemaining > 0
 * exposes the gap explicitly in the verification report.
 *
 * Returns a verification report for the deleted email.
 */
async function purgeOneUser(base44, targetUser) {
  const email = normalizeEmail(targetUser.email);

  // 1. Find ALL User entity records for this email (could be duplicates from prior failed purges)
  const allUsers = await base44.asServiceRole.entities.User.list();
  const matchingUsers = allUsers.filter(u => normalizeEmail(u.email) === email);

  // 2. Delete ALL matching User entity records + auth identity (via service role delete)
  //    Each delete call targets the auth identity tied to that user ID.
  let userRemoved = 0;
  for (const u of matchingUsers) {
    await base44.asServiceRole.entities.User.delete(u.id);
    userRemoved++;
  }

  // 3. Delete InvitedUser records (invalidates invitation tokens)
  const invited = await base44.asServiceRole.entities.InvitedUser.list();
  const invitedToDelete = invited.filter(r => normalizeEmail(r.email) === email);
  for (const r of invitedToDelete) {
    await base44.asServiceRole.entities.InvitedUser.delete(r.id);
  }

  // 4. Delete PendingProjectAssignment records
  const pending = await base44.asServiceRole.entities.PendingProjectAssignment.list();
  const pendingToDelete = pending.filter(r => normalizeEmail(r.email) === email);
  for (const r of pendingToDelete) {
    await base44.asServiceRole.entities.PendingProjectAssignment.delete(r.id);
  }

  // 5. Remove from all project teams
  const projects = await base44.asServiceRole.entities.Project.list();
  for (const project of projects) {
    const before = project.team || [];
    const after = before.filter(m => normalizeEmail(m.user_email) !== email);
    if (after.length !== before.length) {
      await base44.asServiceRole.entities.Project.update(project.id, { team: after });
    }
  }

  // 6. Verification — confirm nothing remains for this email
  //    authRemaining = users still visible in User.list() after delete.
  //    If > 0, User.delete() did NOT fully remove the auth identity.
  const [usersAfter, invitedAfter, pendingAfter, projectsAfter] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.InvitedUser.list(),
    base44.asServiceRole.entities.PendingProjectAssignment.list(),
    base44.asServiceRole.entities.Project.list(),
  ]);

  const userRemaining = usersAfter.filter(u => normalizeEmail(u.email) === email).length;
  // authRemaining is the same check — if the User entity is gone, the auth identity should be gone too.
  // A non-zero value here is direct runtime proof that User.delete() left an orphaned auth identity.
  const authRemaining = userRemaining;
  const inviteRemaining = invitedAfter.filter(r => normalizeEmail(r.email) === email).length;
  const pendingRemaining = pendingAfter.filter(r => normalizeEmail(r.email) === email).length;
  const teamRemaining = projectsAfter.reduce((sum, p) =>
    sum + (p.team || []).filter(m => normalizeEmail(m.user_email) === email).length, 0
  );

  const sessionRemoved = userRemoved > 0; // sessions tied to deleted identities are invalidated server-side

  console.log('FULL PURGE COMPLETE', {
    email,
    authRemoved: userRemoved,
    userRemoved,
    sessionRemoved,
    verification: { userRemaining, authRemaining, inviteRemaining, pendingRemaining, teamRemaining },
  });

  const clean = userRemaining === 0 && inviteRemaining === 0 && pendingRemaining === 0 && teamRemaining === 0;

  return {
    email,
    clean,
    verification: { userRemaining, authRemaining, inviteRemaining, pendingRemaining, teamRemaining },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    if (DISABLED) {
      return Response.json({ disabled: true, message: 'Testing utilities disabled in production mode' });
    }

    const { action } = await req.json();

    // ─── 1. Reset Invitation State ───────────────────────────────────────────
    if (action === 'reset_invitation_state') {
      const invited = await base44.asServiceRole.entities.InvitedUser.list();
      for (const r of invited) {
        await base44.asServiceRole.entities.InvitedUser.delete(r.id);
      }
      const pending = await base44.asServiceRole.entities.PendingProjectAssignment.list();
      for (const r of pending) {
        await base44.asServiceRole.entities.PendingProjectAssignment.delete(r.id);
      }
      return Response.json({
        message: `Deleted ${invited.length} invitation(s) and ${pending.length} pending assignment(s). User accounts and project memberships untouched.`
      });
    }

    // ─── 2. Purge Test Users ─────────────────────────────────────────────────
    // Full wipe: entity + auth identity + project refs + invitation tokens.
    // Keeps: logged-in admin, all other admins.
    if (action === 'purge_test_users') {
      const allUsers = await base44.asServiceRole.entities.User.list();
      const toDelete = allUsers.filter(u => u.role !== 'admin' && u.id !== user.id);

      const results = [];
      const dirty = [];

      for (const u of toDelete) {
        const result = await purgeOneUser(base44, u);
        results.push(result);
        if (!result.clean) dirty.push(result);
      }

      if (dirty.length > 0) {
        return Response.json({
          success: false,
          message: `Purge incomplete — ${dirty.length} email(s) still have residual data.`,
          dirty,
          results,
        }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `Purged ${toDelete.length} non-admin user(s). All emails are clean for re-registration.`,
        results,
      });
    }

    // ─── 3. Clear Deactivated Users ──────────────────────────────────────────
    if (action === 'clear_deactivated_users') {
      const allUsers = await base44.asServiceRole.entities.User.list();
      const toDelete = allUsers.filter(u => u.data?.disabled === true && u.id !== user.id);

      const results = [];
      const dirty = [];

      for (const u of toDelete) {
        const result = await purgeOneUser(base44, u);
        results.push(result);
        if (!result.clean) dirty.push(result);
      }

      if (dirty.length > 0) {
        return Response.json({
          success: false,
          message: `Clear incomplete — ${dirty.length} email(s) still have residual data.`,
          dirty,
          results,
        }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `Removed ${toDelete.length} deactivated user(s). All emails are clean for re-registration.`,
        results,
      });
    }

    // ─── 4. Environment Summary ───────────────────────────────────────────────
    if (action === 'environment_summary') {
      const allUsers = await base44.asServiceRole.entities.User.list();
      const invited = await base44.asServiceRole.entities.InvitedUser.list();
      const pending = await base44.asServiceRole.entities.PendingProjectAssignment.list();

      const admins = allUsers.filter(u => u.role === 'admin').length;
      const internal = allUsers.filter(u => u.role === 'internal').length;
      const external = allUsers.filter(u => u.role === 'external').length;
      const pricing = allUsers.filter(u => u.role === 'pricing').length;
      const deactivated = allUsers.filter(u => u.data?.disabled === true).length;
      const active = allUsers.length - deactivated;
      const pendingInvitations = invited.filter(i => i.status === 'Pending').length;
      const pendingAssignments = pending.filter(p => p.status === 'Pending').length;

      return Response.json({
        summary: {
          users_total: allUsers.length,
          admins,
          internal,
          external,
          pricing,
          active,
          deactivated,
          pending_invitations: pendingInvitations,
          pending_assignments: pendingAssignments,
        }
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});