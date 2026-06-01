import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/shared/StatusBadge';
import { Plus, MessageSquare, ChevronDown, ChevronUp, Calendar, Send } from 'lucide-react';
import { format } from 'date-fns';

const PRIORITY_COLORS = {
  Low: 'bg-blue-100 text-blue-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

function RFICard({ rfi, project, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const respondMutation = useMutation({
    mutationFn: async (content) => {
      const newResponse = {
        author_email: user?.email || '',
        author_name: user?.full_name || user?.email || 'Unknown',
        content,
        timestamp: new Date().toISOString(),
        attachments: [],
      };
      const updatedResponses = [...(rfi.responses || []), newResponse];
      const newStatus = rfi.status === 'Open' ? 'Answered' : rfi.status;
      await base44.entities.RFI.update(rfi.id, { responses: updatedResponses, status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfis', project.id] });
      setReplyText('');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status) => base44.entities.RFI.update(rfi.id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfis', project.id] }),
  });

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    respondMutation.mutate(replyText.trim());
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* RFI Header Row */}
        <div
          className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">#{String(rfi.number).padStart(3, '0')}</span>
              <span className="text-sm font-semibold truncate">{rfi.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[rfi.priority] || ''}`}>
                {rfi.priority}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {rfi.assigned_to_name && <span>→ {rfi.assigned_to_name}</span>}
              {rfi.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(rfi.due_date), 'MMM d, yyyy')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {(rfi.responses || []).length} response{(rfi.responses || []).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={rfi.status} />
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t px-4 pb-4 space-y-4">
            {rfi.description && (
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{rfi.description}</p>
              </div>
            )}

            {/* Response thread */}
            {(rfi.responses || []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Responses</p>
                {(rfi.responses || []).map((resp, i) => (
                  <div key={i} className="bg-muted/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{resp.author_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {resp.timestamp ? format(new Date(resp.timestamp), 'MMM d, HH:mm') : ''}
                      </span>
                    </div>
                    <p className="text-sm">{resp.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply box */}
            {rfi.status !== 'Closed' && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-muted-foreground">Add Response</p>
                <Textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your response..."
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {rfi.status === 'Answered' && (
                      <Button
                        size="sm" variant="outline" className="text-xs h-8"
                        onClick={() => statusMutation.mutate('Closed')}
                        disabled={statusMutation.isPending}
                      >
                        Close RFI
                      </Button>
                    )}
                    {rfi.status === 'Open' && (
                      <Button
                        size="sm" variant="outline" className="text-xs h-8"
                        onClick={() => statusMutation.mutate('Closed')}
                        disabled={statusMutation.isPending}
                      >
                        Close RFI
                      </Button>
                    )}
                  </div>
                  <Button
                    size="sm" className="gap-1.5 h-8 text-xs"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || respondMutation.isPending}
                  >
                    <Send className="w-3 h-3" />
                    {respondMutation.isPending ? 'Sending...' : 'Send Response'}
                  </Button>
                </div>
              </div>
            )}

            {rfi.status === 'Closed' && (
              <div className="flex justify-end">
                <Button
                  size="sm" variant="outline" className="text-xs h-8"
                  onClick={() => statusMutation.mutate('Open')}
                  disabled={statusMutation.isPending}
                >
                  Re-open RFI
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectRFIPanel({ project, rfis = [] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'Medium', due_date: '', assigned_to_email: '', assigned_to_name: '' });
  const queryClient = useQueryClient();
  const teamMembers = project?.team || [];

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const existing = await base44.entities.RFI.list('-number', 1);
      const nextNumber = existing.length > 0 ? (existing[0].number || 0) + 1 : 1;
      const rfi = await base44.entities.RFI.create({
        ...data,
        project_id: project.id,
        number: nextNumber,
        status: 'Open',
        responses: [],
        attachments: [],
      });
      if (data.assigned_to_email) {
        base44.integrations.Core.SendEmail({
          to: data.assigned_to_email,
          subject: `New RFI Assigned: ${data.title}`,
          body: `You have been assigned RFI-${String(nextNumber).padStart(3, '0')}: ${data.title}\n\nDescription: ${data.description || 'No description'}\n\nPlease log in to respond.`,
        });
      }
      return rfi;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfis', project.id] });
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'Medium', due_date: '', assigned_to_email: '', assigned_to_name: '' });
    },
  });

  const handleAssigneeChange = (value) => {
    if (value === 'unassigned') {
      setForm(f => ({ ...f, assigned_to_email: '', assigned_to_name: '' }));
      return;
    }
    const member = teamMembers.find(m => m.user_email === value);
    if (member) setForm(f => ({ ...f, assigned_to_email: member.user_email, assigned_to_name: member.full_name }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rfis.length} RFI{rfis.length !== 1 ? 's' : ''}</p>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3" /> New RFI
        </Button>
      </div>

      {rfis.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
          No RFIs for this project yet.
        </div>
      )}

      {rfis.map(rfi => (
        <RFICard key={rfi.id} rfi={rfi} project={project} />
      ))}

      {/* Create RFI Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New RFI — {project.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="RFI title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the information needed" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Assign To</Label>
              {teamMembers.length > 0 ? (
                <Select value={form.assigned_to_email || 'unassigned'} onValueChange={handleAssigneeChange}>
                  <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">— Unassigned —</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.user_email} value={m.user_email}>{m.full_name} — {m.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.assigned_to_name} onChange={e => setForm({ ...form, assigned_to_name: e.target.value })} placeholder="Name" />
                  <Input type="email" value={form.assigned_to_email} onChange={e => setForm({ ...form, assigned_to_email: e.target.value })} placeholder="Email" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.title || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create RFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}