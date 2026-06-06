import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle, FileText, FolderOpen, Users, Send, ShieldCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function computeHealth(tender) {
  const docs     = tender.documents || [];
  const invitees = tender.invitees  || [];

  // Document checks — O(1) using Map for duplicate detection
  const docsWithoutUrl = docs.filter(d => !d.file_url);
  const docKeyCounts   = new Map();
  for (const d of docs) {
    const k = `${d.folder_path || ''}|${d.name}`;
    docKeyCounts.set(k, (docKeyCounts.get(k) || 0) + 1);
  }
  const dupDocKeySet  = new Set([...docKeyCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  const uniqueFolders = new Set(docs.map(d => d.folder_path || '').filter(Boolean));

  // Invitee checks — O(1) using Set
  const invalidEmails = invitees.filter(i => i.email && !EMAIL_RE.test(i.email));
  const missingEmails = invitees.filter(i => !i.email);
  const seenEmails    = new Set();
  const dupEmails     = invitees.filter(i => {
    if (!i.email) return false;
    const k = i.email.toLowerCase();
    if (seenEmails.has(k)) return true;
    seenEmails.add(k);
    return false;
  });
  const missingTokens = invitees.filter(i => !i.token);

  const issues = [];

  // Errors (block issuing)
  if (docs.length === 0)
    issues.push({ severity: 'error', msg: 'No documents uploaded' });
  if (docsWithoutUrl.length > 0)
    issues.push({ severity: 'error', msg: `${docsWithoutUrl.length} document${docsWithoutUrl.length !== 1 ? 's' : ''} missing file URL` });
  if (invalidEmails.length > 0)
    issues.push({ severity: 'error', msg: `${invalidEmails.length} invalid email address${invalidEmails.length !== 1 ? 'es' : ''}` });
  if (dupEmails.length > 0)
    issues.push({ severity: 'error', msg: `${dupEmails.length} duplicate email${dupEmails.length !== 1 ? 's' : ''} in invitee list` });
  if (missingTokens.length > 0)
    issues.push({ severity: 'error', msg: `${missingTokens.length} invitee${missingTokens.length !== 1 ? 's' : ''} missing invitation token` });

  // Warnings (allow issuing, but flag)
  if (invitees.length === 0)
    issues.push({ severity: 'warning', msg: 'No invitees added yet' });
  if (missingEmails.length > 0)
    issues.push({ severity: 'warning', msg: `${missingEmails.length} invitee${missingEmails.length !== 1 ? 's' : ''} without email — will not receive invitation` });
  if (dupDocKeySet.size > 0)
    issues.push({ severity: 'warning', msg: `${dupDocKeySet.size} duplicate document name${dupDocKeySet.size !== 1 ? 's' : ''} detected` });

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const isReady    = errorCount === 0 && docs.length > 0 && invitees.length > 0;

  return {
    docs:          docs.length,
    folders:       uniqueFolders.size,
    invitees:      invitees.length,
    docsWithoutUrl: docsWithoutUrl.length,
    duplicateDocs: dupDocKeySet.size,
    invalidEmails: invalidEmails.length,
    missingEmails: missingEmails.length,
    dupEmails:     dupEmails.length,
    issues,
    isReady,
    errorCount,
  };
}

export default function TenderHealthPanel({ tender, user }) {
  const { toast }         = useToast();
  const [testSending, setTestSending] = useState(false);
  const [lastValidated, setLastValidated] = useState(null);

  const health = computeHealth(tender);

  const handleValidate = () => {
    setLastValidated(new Date());
    if (health.isReady) {
      toast({ title: '✓ Package validated — ready to issue', duration: 4000 });
    } else {
      toast({
        title: 'Validation issues found',
        description: `${health.errorCount} error${health.errorCount !== 1 ? 's' : ''} must be resolved before issuing`,
        variant: 'destructive',
        duration: 6000,
      });
    }
  };

  const handleTestEmail = async () => {
    if (!user?.email) return;
    setTestSending(true);
    try {
      const result = await base44.functions.invoke('sendTenderInvitations', {
        tenderId: tender.id,
        tenderInfo: {
          title:                tender.title,
          tender_number:        tender.tender_number,
          location:             tender.location             || '',
          closing_date:         tender.closing_date         || '',
          description:          tender.description          || '',
          trade_packages:       tender.trade_packages       || [],
          client_name:          tender.client_name          || '',
          architect_name:       tender.architect_name       || '',
          project_manager_name: tender.project_manager_name || '',
        },
        invitees: [{
          id:        'test-preview',
          email:     user.email,
          full_name: user.full_name || user.email,
          token:     crypto.randomUUID(),
        }],
        appUrl: window.location.origin,
      });

      if (result.data?.sent > 0) {
        toast({ title: `Test email sent to ${user.email}`, duration: 5000 });
      } else {
        toast({
          title: 'Test email failed',
          description: result.data?.error || 'Check RESEND_API_KEY and email branding settings',
          variant: 'destructive',
          duration: 6000,
        });
      }
    } catch (err) {
      toast({ title: 'Test email failed', description: err.message, variant: 'destructive', duration: 6000 });
    } finally {
      setTestSending(false);
    }
  };

  const statusColour = health.isReady
    ? 'text-green-700 bg-green-50 border-green-200'
    : health.errorCount > 0
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-amber-700 bg-amber-50 border-amber-200';

  const StatusIcon = health.isReady ? CheckCircle2 : health.errorCount > 0 ? XCircle : AlertTriangle;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColour}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {health.isReady
            ? 'Package Ready to Issue'
            : health.errorCount > 0
              ? `${health.errorCount} Error${health.errorCount !== 1 ? 's' : ''} — Cannot Issue`
              : 'Warnings — Review Before Issuing'}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleValidate}>
            <ShieldCheck className="w-3 h-3" /> Validate Package
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={handleTestEmail}
            disabled={testSending || !user?.email}
          >
            {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {testSending ? 'Sending…' : 'Send Test Email'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x border-b bg-card">
        {[
          { icon: FileText,   label: 'Documents', value: health.docs },
          { icon: FolderOpen, label: 'Folders',   value: health.folders },
          { icon: Users,      label: 'Invitees',  value: health.invitees },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2.5 px-4 py-3">
            <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
              <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Issues list */}
      {health.issues.length > 0 ? (
        <div className="divide-y">
          {health.issues.map((issue, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-4 py-2 text-xs ${
                issue.severity === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {issue.severity === 'error'
                ? <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
              {issue.msg}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-green-700 bg-green-50">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          All checks passed — package is ready to issue
          {lastValidated && (
            <span className="ml-auto text-green-600 opacity-70">
              Validated {lastValidated.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}