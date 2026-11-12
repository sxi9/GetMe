// Shared notification centre: bell button with unread badge + bottom sheet.
import { useEffect, useState } from 'react';
import type { Notification } from '@getme/core';
import { api, post } from './api';
import { useEvent } from './store';
import { useT } from './i18n';
import { Icon, IconButton, Sheet, Empty } from '../ui';

export function useNotifications() {
  const [list, setList] = useState<Notification[]>([]);
  const load = () => api<Notification[]>('/api/notifications').then(setList).catch(() => {});
  useEffect(() => { void load(); }, []);
  useEvent(ev => { if (ev.type === 'notify') setList(l => [{ id: 'tmp' + Date.now(), userId: '', title: ev.title, body: ev.body, orderId: ev.orderId, read: false, at: new Date().toISOString() }, ...l].slice(0, 50)); });
  const unread = list.filter(n => !n.read).length;
  const markRead = async () => { setList(l => l.map(n => ({ ...n, read: true }))); await post('/api/notifications/read').catch(() => {}); };
  return { list, unread, markRead, reload: load };
}

export function NotificationBell({ onOpen, reverse = true }: { onOpen: (n: Notification) => void; reverse?: boolean }) {
  const { t } = useT();
  const { list, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  return (
    <>
      <IconButton icon="notifications" label={t('Notifications')} color={reverse ? 'reverse' : 'default'} badge={unread} onClick={() => { setOpen(true); if (unread) void markRead(); }} />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Notifications')}>
        {!list.length && <Empty icon="notifications" title={t('Nothing yet')} text={t('Order updates and messages show up here.')} />}
        <div className="list">{list.slice(0, 30).map(n => (
          <div key={n.id} className={'item' + (n.orderId ? ' clickable' : '')} onClick={() => { if (n.orderId) { setOpen(false); onOpen(n); } }}>
            <Icon name={n.orderId ? 'local_shipping' : 'campaign'} size={20} color={n.read ? 'var(--icon)' : 'var(--brand-primary-rest)'} />
            <div className="grow"><div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>{n.body && <div className="cap">{n.body}</div>}</div>
            <div className="cap" style={{ whiteSpace: 'nowrap' }}>{ago(n.at)}</div>
          </div>))}</div>
      </Sheet>
    </>
  );
}
