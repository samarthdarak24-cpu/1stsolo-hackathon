import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveUrl, tokenStore } from './api';

/**
 * useLiveEvents — manages an EventSource SSE connection to /api/events.
 * Reconnects on errors with exponential backoff.
 * Invalidates related TanStack Query caches whenever an event arrives.
 *
 * NOTE: Standard browser EventSource does not support custom request headers,
 * so we supply the JWT via the ?token= query parameter.
 */
export function useLiveEvents(orgId) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const esRef = useRef(null);
  const backoffRef = useRef(1000);
  // Resume cursor: id of the last frame this client actually received. Re-sent
  // on every (re)connect so the server can replay whatever the outage missed
  // (SSE Last-Event-ID semantics — browsers only resend the header on their own
  // automatic retries, and we open fresh EventSource objects for backoff).
  const lastEventIdRef = useRef(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token || !orgId) {
      setConnected(false);
      return undefined;
    }

    let active = true;

    function connect() {
      if (!active) return;
      const resume = lastEventIdRef.current
        ? `&lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
        : '';
      const url = resolveUrl(`/api/events?token=${encodeURIComponent(token)}${resume}`);
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (!active) return;
        setConnected(true);
        backoffRef.current = 1000;
      };

      const handleEvent = (type, data, eventId) => {
        if (!active) return;
        // Advance the resume cursor; the `id:` line of each frame arrives as
        // e.lastEventId on the EventSource event object.
        if (eventId) lastEventIdRef.current = eventId;
        setLastEvent({ type, data, receivedAt: new Date().toISOString() });

        // Notification lists + the unread badge. The badge query key is
        // ['unread', orgId] — the previous 'unread-count' /
        // 'unread-notifications' keys matched nothing, so the bell only moved
        // on its 60-second poll instead of the moment something happened.
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['unread'] });

        if (type.includes('MATCH')) {
          qc.invalidateQueries({ queryKey: ['matches', orgId] });
          qc.invalidateQueries({ queryKey: ['match', orgId] });
        }
        if (type.includes('REPORT')) {
          qc.invalidateQueries({ queryKey: ['reports', orgId] });
          qc.invalidateQueries({ queryKey: ['report', orgId] });
          qc.invalidateQueries({ queryKey: ['items-in-custody', orgId] });
          qc.invalidateQueries({ queryKey: ['cctv-events', orgId] });
          qc.invalidateQueries({ queryKey: ['search', orgId] });
        }
        if (type.includes('VERIFICATION')) {
          qc.invalidateQueries({ queryKey: ['verifications', orgId] });
          qc.invalidateQueries({ queryKey: ['match', orgId] });
        }
        if (type.includes('RETURN')) {
          qc.invalidateQueries({ queryKey: ['returns', orgId] });
          qc.invalidateQueries({ queryKey: ['return', orgId] });
        }
        if (type.includes('CUSTODY')) {
          qc.invalidateQueries({ queryKey: ['custody', orgId] });
        }
        if (type === 'ORGANIZATION') {
          qc.invalidateQueries({ queryKey: ['organizations'] });
          qc.invalidateQueries({ queryKey: ['org-users', orgId] });
          qc.invalidateQueries({ queryKey: ['org-settings', orgId] });
        }
        // Any entity churn moves the numbers on the dashboards, the analytics
        // and the audit trail. Only mounted screens actually refetch, so this
        // costs nothing on a page that does not show them.
        if (/REPORT|MATCH|VERIFICATION|RETURN|CUSTODY/.test(type)) {
          qc.invalidateQueries({ queryKey: ['dashboard', orgId] });
          qc.invalidateQueries({ queryKey: ['audit-logs', orgId] });
          qc.invalidateQueries({ queryKey: ['org-analytics', orgId] });
          qc.invalidateQueries({ queryKey: ['user-analytics', orgId] });
        }
      };

      es.addEventListener('ready', (e) => {
        try {
          handleEvent('ready', JSON.parse(e.data), e.lastEventId);
        } catch {
          handleEvent('ready', {}, e.lastEventId);
        }
      });

      // Entity *UPDATE types come from the mutation points themselves (see the
      // backend services), so lists refresh even when no notification fires.
      const registeredTypes = [
        'NEW_MATCH',
        'MATCH_UPDATE',
        'VERIFICATION_REQUIRED',
        'VERIFICATION_RESULT',
        'VERIFICATION_UPDATE',
        'RETURN_READY',
        'ITEM_RETURNED',
        'RETURN_UPDATE',
        'REPORT_UPDATE',
        'CUSTODY_UPDATE',
        'ORGANIZATION',
        'SYSTEM'
      ];

      registeredTypes.forEach((t) => {
        es.addEventListener(t, (e) => {
          try {
            handleEvent(t, JSON.parse(e.data), e.lastEventId);
          } catch {
            handleEvent(t, { raw: e.data }, e.lastEventId);
          }
        });
      });

      es.onerror = () => {
        if (!active) return;
        setConnected(false);
        es.close();
        // Exponential backoff up to 15s
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 1.5, 15000);
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      active = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, [orgId, qc]);

  return { connected, lastEvent };
}

export default useLiveEvents;
