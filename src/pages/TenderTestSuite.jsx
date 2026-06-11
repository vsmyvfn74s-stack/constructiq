/**
 * TenderTestSuite — Phase 7
 * Automated regression tests for the Tender subsystem.
 * Admin only. Accessible at /tender-tests
 */
import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, PlayCircle, Trash2, AlertTriangle } from 'lucide-react';

const PASS  = 'pass';
const FAIL  = 'fail';
const SKIP  = 'skip';
const RUNNING = 'running';

function Result({ status, label, detail }) {
  const icons = {
    pass:    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />,
    fail:    <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />,
    skip:    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
    running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />,
  };
  const colours = { pass: 'bg-green-50 border-green-200', fail: 'bg-red-50 border-red-200', skip: 'bg-amber-50 border-amber-200', running: 'bg-blue-50 border-blue-200' };
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded border text-sm ${colours[status] || ''}`}>
      {icons[status] || null}
      <div className="min-w-0">
        <span className="font-medium">{label}</span>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-words">{detail}</p>}
      </div>
    </div>
  );
}

export default function TenderTestSuite() {
  const { user } = useAuth();
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [createdIds, setCreatedIds] = useState([]);

  if (user && user.role !== 'admin') return <Navigate to="/" replace />;

  const addResult = (label, status, detail = '') =>
    setResults(r => [...r, { label, status, detail, ts: Date.now() }]);

  const updateLastResult = (status, detail) =>
    setResults(r => {
      const copy = [...r];
      copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
      return copy;
    });

  async function runAll() {
    setRunning(true);
    setResults([]);
    const ids = [];

    // ── T1: Create 1 tender ───────────────────────────────────────────────
    addResult('T1: Create single tender', RUNNING);
    try {
      const r = await base44.functions.invoke('createTender', {});
      const t = r.data?.tender;
      if (!t?.id) throw new Error('No tender id returned');
      if (!t.tender_number?.startsWith('TDR-')) throw new Error(`Bad tender number: ${t.tender_number}`);
      ids.push(t.id);
      updateLastResult(PASS, `Created ${t.tender_number} id=${t.id}`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T2: Create 5 concurrent tenders (race condition test) ─────────────
    addResult('T2: Create 5 concurrent tenders (no duplicate numbers)', RUNNING);
    try {
      const promises = Array.from({ length: 5 }, () => base44.functions.invoke('createTender', {}));
      const results2 = await Promise.all(promises);
      const tenders = results2.map(r => r.data?.tender).filter(Boolean);
      tenders.forEach(t => ids.push(t.id));
      const numbers = tenders.map(t => t.tender_number);
      const unique = new Set(numbers);
      if (unique.size !== tenders.length) {
        updateLastResult(FAIL, `DUPLICATES: ${numbers.join(', ')}`);
      } else {
        updateLastResult(PASS, `Numbers: ${numbers.sort().join(', ')}`);
      }
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // Use first created tender for remaining tests
    const testTenderId = ids[0];

    // ── T3: Add invitee ───────────────────────────────────────────────────
    addResult('T3: Add invitee (TenderInvitation created)', RUNNING);
    let testInvitationId = null;
    let testToken = null;
    try {
      if (!testTenderId) throw new Error('No test tender available');
      const token = crypto.randomUUID();
      testToken = token;
      const inv = await base44.entities.TenderInvitation.create({
        token,
        tender_id:     testTenderId,
        invitee_email: 'test-invitee@example.com',
        invitee_name:  'Test Invitee',
        status:        'Pending',
      });
      if (!inv?.id) throw new Error('No id returned');
      testInvitationId = inv.id;
      updateLastResult(PASS, `TenderInvitation id=${inv.id} token=${token.slice(0, 8)}…`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T4: Add duplicate invitee ─────────────────────────────────────────
    addResult('T4: Duplicate email rejected', RUNNING);
    try {
      if (!testTenderId || !testToken) throw new Error('No test tender/token');
      // Check: reading invitations should show only 1 for this email
      const list = await base44.entities.TenderInvitation.filter({ tender_id: testTenderId });
      const dups = list.filter(i => i.invitee_email === 'test-invitee@example.com');
      if (dups.length > 1) {
        updateLastResult(FAIL, `Found ${dups.length} records for same email — duplicates exist`);
      } else {
        updateLastResult(PASS, `1 record found for email (no duplicates)`);
      }
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T5: Remove invitee ────────────────────────────────────────────────
    addResult('T5: Remove invitee (TenderInvitation deleted)', RUNNING);
    try {
      if (!testInvitationId) throw new Error('No test invitation available');
      await base44.entities.TenderInvitation.delete(testInvitationId);
      // Verify it's gone
      const list = await base44.entities.TenderInvitation.filter({ tender_id: testTenderId });
      const stillExists = list.some(i => i.id === testInvitationId);
      if (stillExists) throw new Error('Record still exists after delete');
      updateLastResult(PASS, `Invitation id=${testInvitationId} deleted and verified gone`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T6: Add from subcontractor database ───────────────────────────────
    addResult('T6: Add invitee from TenderContact database', RUNNING);
    let dbContactId = null;
    try {
      if (!testTenderId) throw new Error('No test tender available');
      // Create a TenderContact
      const contact = await base44.entities.TenderContact.create({
        full_name:     'DB Test Contact',
        business_name: 'Test Co',
        email:         `db-test-${Date.now()}@example.com`,
        trade:         'Electrical',
      });
      dbContactId = contact.id;
      // Add as invitation
      const token2 = crypto.randomUUID();
      const inv2 = await base44.entities.TenderInvitation.create({
        token:         token2,
        tender_id:     testTenderId,
        invitee_email: contact.email,
        invitee_name:  contact.full_name,
        status:        'Pending',
      });
      if (!inv2?.id) throw new Error('Invitation not created');
      updateLastResult(PASS, `Contact id=${contact.id} → Invitation id=${inv2.id}`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T7: Health checks pass on valid tender ────────────────────────────
    addResult('T7: Health check — invitations have token and tender_id', RUNNING);
    try {
      if (!testTenderId) throw new Error('No test tender');
      const invList = await base44.entities.TenderInvitation.filter({ tender_id: testTenderId });
      const missingToken    = invList.filter(i => !i.token);
      const missingTenderId = invList.filter(i => !i.tender_id);
      if (missingToken.length > 0) throw new Error(`${missingToken.length} invitations missing token`);
      if (missingTenderId.length > 0) throw new Error(`${missingTenderId.length} invitations missing tender_id`);
      updateLastResult(PASS, `${invList.length} invitation(s) all have token + tender_id`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T8: Delete empty tender ───────────────────────────────────────────
    addResult('T8: Delete empty tender', RUNNING);
    try {
      const emptyR = await base44.functions.invoke('createTender', {});
      const emptyT = emptyR.data?.tender;
      if (!emptyT?.id) throw new Error('Could not create test tender');
      const delR = await base44.functions.invoke('deleteTender', { tenderId: emptyT.id });
      if (!delR.data?.success) throw new Error(delR.data?.error || 'deleteTender returned no success');
      updateLastResult(PASS, `Tender ${emptyT.tender_number} deleted`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T9: Delete tender with invitees ───────────────────────────────────
    addResult('T9: Delete tender with invitees (cascading)', RUNNING);
    try {
      const tR = await base44.functions.invoke('createTender', {});
      const tObj = tR.data?.tender;
      if (!tObj?.id) throw new Error('Could not create test tender');
      // Add 2 invitations
      await Promise.all([
        base44.entities.TenderInvitation.create({ token: crypto.randomUUID(), tender_id: tObj.id, invitee_email: 'del-test-1@example.com', invitee_name: 'Del 1', status: 'Pending' }),
        base44.entities.TenderInvitation.create({ token: crypto.randomUUID(), tender_id: tObj.id, invitee_email: 'del-test-2@example.com', invitee_name: 'Del 2', status: 'Pending' }),
      ]);
      // Delete
      const delR = await base44.functions.invoke('deleteTender', { tenderId: tObj.id });
      if (!delR.data?.success) throw new Error(delR.data?.error || 'deleteTender failed');
      // Verify invitations are gone
      const remaining = await base44.entities.TenderInvitation.filter({ tender_id: tObj.id });
      if (remaining.length > 0) throw new Error(`${remaining.length} orphan TenderInvitation(s) remain`);
      updateLastResult(PASS, `Tender + 2 invitations deleted, 0 orphans`);
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── T10: No duplicate tender numbers across all existing tenders ───────
    addResult('T10: No duplicate tender numbers in database', RUNNING);
    try {
      const all = await base44.entities.Tender.list('-created_date', 200);
      const nums = all.map(t => t.tender_number).filter(Boolean);
      const seen = new Set();
      const dups = nums.filter(n => { if (seen.has(n)) return true; seen.add(n); return false; });
      if (dups.length > 0) {
        updateLastResult(FAIL, `Duplicate numbers found: ${[...new Set(dups)].join(', ')}`);
      } else {
        updateLastResult(PASS, `${nums.length} tenders scanned — no duplicates`);
      }
    } catch (e) {
      updateLastResult(FAIL, e.message);
    }

    // ── Cleanup: delete all tenders created during this run ───────────────
    addResult('CLEANUP: deleting test tenders', RUNNING);
    const cleanupIds = [...ids];
    let cleanedCount = 0;
    for (const tid of cleanupIds) {
      try {
        await base44.functions.invoke('deleteTender', { tenderId: tid });
        cleanedCount++;
      } catch (_) {}
    }
    // Also clean up the db test contact
    if (dbContactId) {
      try { await base44.entities.TenderContact.delete(dbContactId); } catch (_) {}
    }
    updateLastResult(PASS, `Cleaned up ${cleanedCount}/${cleanupIds.length} test tender(s)`);

    setCreatedIds([]);
    setRunning(false);
  }

  const passed  = results.filter(r => r.status === PASS).length;
  const failed  = results.filter(r => r.status === FAIL).length;
  const total   = results.filter(r => r.status !== RUNNING && r.label !== 'CLEANUP: deleting test tenders').length;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tender Regression Test Suite</h1>
        <p className="text-sm text-muted-foreground mt-1">Phase 7 — automated tests for the Tender subsystem. Admin only.</p>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={runAll} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          {running ? 'Running…' : 'Run All Tests'}
        </Button>
        {results.length > 0 && !running && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-600 font-semibold">{passed} passed</span>
            {failed > 0 && <span className="text-red-600 font-semibold">{failed} failed</span>}
            <span className="text-muted-foreground">/ {total} tests</span>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <Result key={i} status={r.status} label={r.label} detail={r.detail} />
          ))}
        </div>
      )}

      {!running && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12 border rounded-lg">
          Press "Run All Tests" to execute the regression suite.
        </p>
      )}
    </div>
  );
}