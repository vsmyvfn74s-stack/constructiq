/**
 * OutcomePanel
 *
 * Two modes:
 *  - ACTIVE: tender is not converted — full workflow (assign outcomes, send notifications, convert).
 *  - LOCKED (read-only audit): tender.status === 'Converted' OR converted_project_id exists.
 *
 * Admin-only "Reopen Tender" escape hatch shown in locked mode.
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Send, CheckCircle2, XCircle, ExternalLink, Bell, BellOff, Lock, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { resolveTemplate, applyTemplate, buildEmailHtml } from '@/lib/emailTemplates';
import { isAdmin } from '@/lib/permissions';

export default function OutcomePanel({ tender, onUpdate, onConvert, canManage }) {
  const { user }    = useAuth();
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  // Locked mode: converted tender is a read-only audit record
  const isLocked = tender.status === 'Converted' || !!tender.converted_project_id;

  const [ourResult, setOurResult] = useState(tender.our_result || '');
  const [ourNotes, setOurNotes]   = useState(tender.our_result_notes || '');
  const [sending, setSending]     = useState(false);
  const [savingOur, setSavingOur] = useState(false);
  const [reopening, setReopening] = useState(false);

  const { data: submissions = [] } = useQuery({
    queryKey: ['tenderSubmissions', tender.id],
    queryFn:  () => base44.entities.TenderSubmission.filter({ tender_id: tender.id }),
    enabled:  !!tender.id,
  });

  const { data: convertedProject } = useQuery({
    queryKey: ['project', tender.converted_project_id],
    queryFn:  () => base44.entities.Project.filter({ id: tender.converted_project_id }).then(r => r[0] ?? null),
    enabled:  !!tender.converted_project_id,
  });

  // Local outcome state — only used in active mode
  const [subOutcomes, setSubOutcomes] = useState({});
  const [subNotes, setSubNotes]       = useState({});

  useEffect(() => {
    if (!submissions.length) return;
    setSubOutcomes(prev => {
      const m = {};
      submissions.forEach(s => { m[s.id] = prev[s.id] ?? s.outcome ?? ''; });
      return m;
    });
    setSubNotes(prev => {
      const m = {};
      submissions.forEach(s => { m[s.id] = prev[s.id] ?? s.outcome_notes ?? ''; });
      return m;
    });
  }, [submissions]);

  const { data: emailTemplates = [] } = useQuery({
    queryKey: ['emailTemplates'],
    queryFn:  () => base44.entities.EmailTemplate.list(),
    enabled:  !isLocked,
  });
  const { data: emailBranding = {} } = useQuery({
    queryKey: ['emailBranding'],
    queryFn:  () => base44.entities.EmailBranding.list().then(r => r[0] ?? {}),
    enabled:  !isLocked,
  });

  // Group submissions by trade
  const groupedByTrade = submissions.reduce((acc, s) => {
    const trade = s.trade || 'Unspecified';
    if (!acc[trade]) acc[trade] = [];
    acc[trade].push(s);
    return acc;
  }, {});

  // ── Actions (active mode only) ────────────────────────────────────────────

  const saveOurResult = async () => {
    setSavingOur(true);
    await onUpdate({ our_result: ourResult, our_result_notes: ourNotes });
    queryClient.invalidateQueries({ queryKey: ['tender', tender.id] });
    queryClient.invalidateQueries({ queryKey: ['tenders'] });
    setSavingOur(false);
    toast({ title: 'Result saved' });
  };

  const notifyWeUnsuccessful = async () => {
    setSending(true);
    const tplKey = 'tender_outcome_unsuccessful';
    const tpl = resolveTemplate(emailTemplates, tplKey);
    let sent = 0, failed = 0;
    for (const sub of submissions) {
      if (!sub.invitee_email) continue;
      try {
        const { subject, body } = applyTemplate(tpl, {
          tender_number: tender.tender_number || '',
          title:         tender.title || '',
          invitee_name:  sub.invitee_name || '',
          sender_name:   user?.full_name || '',
          company_name:  emailBranding?.company_name || 'ConstructIQ',
        });
        const htmlBody = buildEmailHtml(body, emailBranding);
        const res = await base44.functions.invoke('sendEmail', { to: sub.invitee_email, toName: sub.invitee_name || '', subject, htmlBody, templateKey: tplKey });
        const resData = res?.data;
        if (resData?.success === true && resData?.id) { sent++; } else { failed++; }
      } catch (e) { failed++; }
    }
    toast({
      title: sent > 0 ? `Notified ${sent} subcontractor${sent !== 1 ? 's' : ''}` : 'No emails sent',
      description: failed > 0 ? `${failed} failed — check console` : undefined,
      variant: sent === 0 ? 'destructive' : 'default',
    });
    setSending(false);
  };

  const sendAllOutcomeNotifications = async () => {
    setSending(true);
    let sent = 0, failed = 0;
    for (const sub of submissions) {
      if (!sub.invitee_email) continue;
      const outcome = subOutcomes[sub.id];
      const tplKey  = outcome === 'Awarded' ? 'tender_sub_awarded' : 'tender_sub_unsuccessful';
      const tpl     = resolveTemplate(emailTemplates, tplKey);
      try {
        const { subject, body } = applyTemplate(tpl, {
          tender_number: tender.tender_number || '',
          title:         tender.title || '',
          invitee_name:  sub.invitee_name || '',
          sender_name:   user?.full_name || '',
          company_name:  emailBranding?.company_name || 'ConstructIQ',
        });
        const htmlBody = buildEmailHtml(body, emailBranding);
        const res = await base44.functions.invoke('sendEmail', { to: sub.invitee_email, toName: sub.invitee_name || '', subject, htmlBody, templateKey: tplKey });
        const resData = res?.data;
        if (resData?.success === true && resData?.id) {
          await base44.entities.TenderSubmission.update(sub.id, {
            outcome:             outcome || '',
            outcome_notes:       subNotes[sub.id] || '',
            outcome_notified_at: new Date().toISOString(),
          });
          sent++;
        } else {
          failed++;
          toast({ title: `Notification failed for ${sub.invitee_name || sub.invitee_email}`, description: resData?.error || 'Resend did not confirm delivery', variant: 'destructive' });
        }
      } catch (e) {
        failed++;
        toast({ title: `Notification failed for ${sub.invitee_name || sub.invitee_email}`, description: e?.message, variant: 'destructive' });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['tenderSubmissions', tender.id] });
    const anyAwarded = Object.values(subOutcomes).some(o => o === 'Awarded');
    await onUpdate({
      status:     anyAwarded ? 'Awarded' : 'Unsuccessful',
      award_date: anyAwarded ? new Date().toISOString().split('T')[0] : tender.award_date,
    });
    toast({
      title: sent > 0 ? `Notifications sent to ${sent} subcontractor${sent !== 1 ? 's' : ''}` : 'No emails sent',
      description: failed > 0 ? `${failed} failed` : undefined,
      variant: sent === 0 ? 'destructive' : 'default',
    });
    setSending(false);
  };

  const sendSingleNotification = async (sub) => {
    console.log('[TRACE] entering sendSingleNotification', { subId: sub.id, email: sub.invitee_email });
    if (!sub.invitee_email) { toast({ title: 'No email address', variant: 'destructive' }); return; }
    const outcome = subOutcomes[sub.id];
    const tplKey  = outcome === 'Awarded' ? 'tender_sub_awarded' : 'tender_sub_unsuccessful';
    const tpl     = resolveTemplate(emailTemplates, tplKey);
    try {
      const { subject, body } = applyTemplate(tpl, {
        tender_number: tender.tender_number || '',
        title:         tender.title || '',
        invitee_name:  sub.invitee_name || '',
        sender_name:   user?.full_name || '',
        company_name:  emailBranding?.company_name || 'ConstructIQ',
      });
      const htmlBody = buildEmailHtml(body, emailBranding);
      const payload = { to: sub.invitee_email, toName: sub.invitee_name || '', subject, htmlBody, templateKey: tplKey };
      console.log('[TRACE] payload', { to: payload.to, toName: payload.toName, subject: payload.subject, templateKey: payload.templateKey, htmlBodyLength: payload.htmlBody?.length });
      console.log('[TRACE] before invoke sendEmail');
      const res = await base44.functions.invoke('sendEmail', payload);
      console.log('[TRACE] invoke response', JSON.stringify(res));
      console.log('[TRACE] invoke response data', JSON.stringify(res?.data));
      console.log('[TRACE] success check', { success: res?.data?.success, id: res?.data?.id });
      const resData = res?.data;
      if (resData?.success === true && resData?.id) {
        await base44.entities.TenderSubmission.update(sub.id, {
          outcome:             outcome || '',
          outcome_notes:       subNotes[sub.id] || '',
          outcome_notified_at: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['tenderSubmissions', tender.id] });
        toast({ title: `Notification sent to ${sub.invitee_name}` });
      } else {
        toast({ title: 'Notification failed', description: resData?.error || 'Resend did not confirm delivery', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Notification failed', description: e?.message, variant: 'destructive' });
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    await onUpdate({ status: 'Awarded', converted_project_id: null });
    queryClient.invalidateQueries({ queryKey: ['tender', tender.id] });
    queryClient.invalidateQueries({ queryKey: ['tenders'] });
    setReopening(false);
    toast({ title: 'Tender reopened', description: 'Status reset to Awarded. converted_project_id cleared.' });
  };

  // ── LOCKED MODE: Audit Record ─────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="space-y-6">
        {/* Lock banner */}
        <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>This tender has been converted to a project. The outcome record is now locked and read-only.</span>
        </div>

        {/* Linked project card */}
        {tender.converted_project_id && (
          <Card className="border-green-200 bg-green-50/40">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Converted to Project</p>
                  <p className="text-sm font-medium text-foreground">{convertedProject?.name || 'Loading...'}</p>
                  {tender.award_date && (
                    <p className="text-xs text-muted-foreground">
                      Project created on {format(new Date(tender.award_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <Link to={`/projects/${tender.converted_project_id}`}>
                  <Button variant="outline" size="sm" className="gap-2 border-green-500 text-green-700 hover:bg-green-100">
                    <ExternalLink className="w-3 h-3" /> Open Project
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Our Result (read-only) */}
        {tender.our_result && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Our Tender Result</CardTitle></CardHeader>
            <CardContent>
              <div className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium ${
                tender.our_result === 'awarded'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-red-400 bg-red-50 text-red-700'
              }`}>
                {tender.our_result === 'awarded'
                  ? <><CheckCircle2 className="w-4 h-4" /> We were awarded this tender</>
                  : <><XCircle className="w-4 h-4" /> We were unsuccessful</>}
              </div>
              {tender.our_result_notes && (
                <p className="mt-2 text-xs text-muted-foreground border rounded p-2 bg-muted/30">{tender.our_result_notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Outcome Summary table */}
        {submissions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Outcome Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(groupedByTrade).map(([trade, subs]) => (
                <div key={trade}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{trade}</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Business Name</th>
                          <th className="text-left px-3 py-2 font-medium">Contractor</th>
                          <th className="text-right px-3 py-2 font-medium">Submitted Price</th>
                          <th className="text-center px-3 py-2 font-medium">Outcome</th>
                          <th className="text-center px-3 py-2 font-medium">Award Date</th>
                          <th className="text-center px-3 py-2 font-medium">Notification</th>
                          <th className="text-center px-3 py-2 font-medium">Project</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {subs.map(sub => (
                          <tr key={sub.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{sub.business_name || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{sub.invitee_name || sub.full_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {sub.lump_sum_price ? `$${Number(sub.lump_sum_price).toLocaleString('en-NZ')}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {sub.outcome === 'Awarded' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> Awarded
                                </span>
                              ) : sub.outcome === 'Unsuccessful' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                  <XCircle className="w-3 h-3" /> Unsuccessful
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">
                              {tender.award_date ? format(new Date(tender.award_date), 'dd MMM yyyy') : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {sub.outcome_notified_at ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                    <Bell className="w-3 h-3" /> Sent
                                  </span>
                                  <span className="text-muted-foreground text-[10px]">
                                    {format(new Date(sub.outcome_notified_at), 'dd MMM yyyy HH:mm')}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <BellOff className="w-3 h-3" /> Not Sent
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {sub.outcome === 'Awarded' && tender.converted_project_id ? (
                                <Link to={`/projects/${tender.converted_project_id}`}
                                  className="inline-flex items-center gap-1 text-primary text-xs hover:underline font-medium">
                                  <ExternalLink className="w-3 h-3" /> View
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Admin-only: Reopen Tender */}
        {isAdmin(user) && (
          <div className="flex justify-end pt-2 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-destructive">
                  <RotateCcw className="w-3.5 h-3.5" /> Reopen Tender
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reopen this tender?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset the tender status to <strong>Awarded</strong> and unlink the converted project reference.
                    The existing project will <strong>not</strong> be deleted. All historical outcome data will be retained.
                    This action should only be used to correct a conversion error.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleReopen}
                    disabled={reopening}
                  >
                    {reopening ? 'Reopening...' : 'Yes, Reopen Tender'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE MODE: Full workflow ────────────────────────────────────────────
  const hasOutcomeData = submissions.some(s => s.outcome);

  return (
    <div className="space-y-6">

      {/* Award Summary (if outcomes already set) */}
      {hasOutcomeData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Award Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(groupedByTrade).map(([trade, subs]) => (
              <div key={trade}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{trade}</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Business Name</th>
                        <th className="text-left px-3 py-2 font-medium">Contractor</th>
                        <th className="text-right px-3 py-2 font-medium">Submitted Price</th>
                        <th className="text-center px-3 py-2 font-medium">Outcome</th>
                        <th className="text-center px-3 py-2 font-medium">Award Date</th>
                        <th className="text-center px-3 py-2 font-medium">Notification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {subs.map(sub => (
                        <tr key={sub.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{sub.business_name || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{sub.invitee_name || sub.full_name || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {sub.lump_sum_price ? `$${Number(sub.lump_sum_price).toLocaleString('en-NZ')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {sub.outcome === 'Awarded' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                <CheckCircle2 className="w-3 h-3" /> Awarded
                              </span>
                            ) : sub.outcome === 'Unsuccessful' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                <XCircle className="w-3 h-3" /> Unsuccessful
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">
                            {tender.award_date ? format(new Date(tender.award_date), 'dd MMM yyyy') : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {sub.outcome_notified_at ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                  <Bell className="w-3 h-3" /> Sent
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {format(new Date(sub.outcome_notified_at), 'dd MMM yyyy HH:mm')}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <BellOff className="w-3 h-3" /> Not Sent
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Our result */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Our Tender Result</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <button onClick={() => setOurResult('awarded')}
              className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${ourResult === 'awarded' ? 'border-green-500 bg-green-50 text-green-700' : 'border-border hover:border-border/80'}`}>
              <CheckCircle2 className="w-4 h-4" /> We were awarded this tender
            </button>
            <button onClick={() => setOurResult('unsuccessful')}
              className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${ourResult === 'unsuccessful' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border hover:border-border/80'}`}>
              <XCircle className="w-4 h-4" /> We were unsuccessful
            </button>
          </div>
          {ourResult === 'unsuccessful' && (
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={ourNotes} onChange={e => setOurNotes(e.target.value)} rows={2} placeholder="Reason or comments..." />
            </div>
          )}
          {canManage && ourResult && (
            <div className="flex gap-2">
              <Button onClick={saveOurResult} disabled={savingOur} size="sm">
                {savingOur ? 'Saving...' : 'Save Result'}
              </Button>
              {ourResult === 'awarded' && (
                <Button onClick={onConvert} variant="outline" size="sm" className="gap-2 border-green-500 text-green-700 hover:bg-green-50">
                  <CheckCircle2 className="w-4 h-4" /> Convert to Project
                </Button>
              )}
              {ourResult === 'unsuccessful' && submissions.length > 0 && (
                <Button onClick={notifyWeUnsuccessful} disabled={sending} variant="outline" size="sm" className="gap-2">
                  <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Notify subcontractors'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subcontractor outcome assignment */}
      {canManage && submissions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Assign & Notify Subcontractors</CardTitle>
              <Button onClick={sendAllOutcomeNotifications} disabled={sending} size="sm" className="gap-2">
                <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send All Notifications'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {Object.entries(groupedByTrade).map(([trade, subs]) => (
              <div key={trade}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{trade}</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Business Name</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                        <th className="text-center px-3 py-2 font-medium">Outcome</th>
                        <th className="px-3 py-2 font-medium">Notes / Notify</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {subs.map(sub => (
                        <tr key={sub.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">
                            {sub.business_name || sub.invitee_name || '—'}
                            {sub.outcome_notified_at && (
                              <span className="ml-2 text-green-600 text-[10px]">✓ Notified</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {sub.lump_sum_price ? `$${Number(sub.lump_sum_price).toLocaleString('en-NZ')}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center gap-1">
                              <button onClick={() => setSubOutcomes(r => ({ ...r, [sub.id]: 'Awarded' }))}
                                className={`px-2 py-1 rounded text-xs font-medium border transition-all ${subOutcomes[sub.id] === 'Awarded' ? 'bg-green-100 text-green-700 border-green-400' : 'border-border hover:bg-muted'}`}>
                                Awarded
                              </button>
                              <button onClick={() => setSubOutcomes(r => ({ ...r, [sub.id]: 'Unsuccessful' }))}
                                className={`px-2 py-1 rounded text-xs font-medium border transition-all ${subOutcomes[sub.id] === 'Unsuccessful' ? 'bg-red-100 text-red-700 border-red-400' : 'border-border hover:bg-muted'}`}>
                                Unsuccessful
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Textarea value={subNotes[sub.id] || ''} onChange={e => setSubNotes(n => ({ ...n, [sub.id]: e.target.value }))}
                                placeholder="Notes..." className="h-8 text-xs min-h-0 py-1 flex-1" />
                              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs flex-shrink-0"
                                onClick={() => { console.log('[TRACE] notify button clicked', { subId: sub.id }); sendSingleNotification(sub); }}>
                                <Send className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}