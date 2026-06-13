import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format, formatDistanceToNow } from 'date-fns';
import {
  FileText, Send, CheckCircle2, XCircle, UserCheck, Upload,
  ArrowRightLeft, Bell, Plus, StickyNote, Clock
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EVENT_CONFIG = {
  tender_created:       { icon: FileText,       color: 'bg-blue-100 text-blue-600',    label: 'Tender Created' },
  status_changed:       { icon: ArrowRightLeft,  color: 'bg-amber-100 text-amber-600',  label: 'Status Changed' },
  invitation_sent:      { icon: Send,            color: 'bg-indigo-100 text-indigo-600', label: 'Invitation Sent' },
  submission_received:  { icon: CheckCircle2,    color: 'bg-green-100 text-green-600',  label: 'Submission Received' },
  outcome_set:          { icon: XCircle,         color: 'bg-purple-100 text-purple-600', label: 'Outcome Set' },
  note_added:           { icon: StickyNote,      color: 'bg-gray-100 text-gray-600',    label: 'Note' },
  tender_lead_assigned: { icon: UserCheck,       color: 'bg-cyan-100 text-cyan-600',    label: 'Lead Assigned' },
  document_uploaded:    { icon: Upload,          color: 'bg-orange-100 text-orange-600', label: 'Document Uploaded' },
  tender_converted:     { icon: CheckCircle2,    color: 'bg-green-100 text-green-700',  label: 'Converted to Project' },
  reminder_sent:        { icon: Bell,            color: 'bg-yellow-100 text-yellow-600', label: 'Reminder Sent' },
};

export default function TenderActivityFeed({ tenderId }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['tenderActivity', tenderId],
    queryFn: () => base44.entities.TenderActivity.filter(
      { tender_id: tenderId },
      '-occurred_at',
      100
    ),
    enabled: !!tenderId,
    refetchInterval: 30000,
  });

  const addNoteMutation = useMutation({
    mutationFn: () => base44.entities.TenderActivity.create({
      tender_id: tenderId,
      event_type: 'note_added',
      actor_name: user?.full_name || user?.email || 'Unknown',
      actor_email: user?.email || '',
      description: note.trim(),
      occurred_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenderActivity', tenderId] });
      setNote('');
      setAddingNote(false);
      toast({ title: 'Note added' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Note */}
      <div className="flex justify-end">
        {!addingNote ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddingNote(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Note
          </Button>
        ) : (
          <div className="w-full border rounded-lg p-3 bg-muted/20 space-y-2">
            <Textarea
              placeholder="Add a note to the activity feed..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setAddingNote(false); setNote(''); }}>Cancel</Button>
              <Button size="sm" onClick={() => addNoteMutation.mutate()} disabled={!note.trim() || addNoteMutation.isPending}>
                {addNoteMutation.isPending ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <Clock className="w-8 h-8 opacity-30" />
          <p className="text-sm">No activity recorded yet.</p>
          <p className="text-xs">Events like status changes, invitations, and submissions will appear here automatically.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-4 bottom-4 w-px bg-border" />

          <div className="space-y-1">
            {activities.map((event, idx) => {
              const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note_added;
              const Icon = config.icon;
              const ts = event.occurred_at || event.created_date;

              return (
                <div key={event.id || idx} className="flex gap-3 pl-0">
                  {/* Icon dot */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-foreground leading-snug">{event.description || config.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.actor_name || 'System'}
                          {ts && (
                            <span className="ml-1.5">
                              · <span title={ts ? format(new Date(ts), 'dd MMM yyyy HH:mm') : ''}>
                                {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ''}
                              </span>
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}