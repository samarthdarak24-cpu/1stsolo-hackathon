import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

/* ─── Sparkle Accent SVG ─────────────────────────────────────────────────────── */
function Sparkle({ className = '' }) {
  return (
    <svg className={`stroke-current ${className}`} fill="none" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 24 24">
      <line x1="12" x2="16" y1="5" y2="2" />
      <line x1="15" x2="20" y1="9" y2="8" />
    </svg>
  );
}

/* ─── Backpack SVG ───────────────────────────────────────────────────────────── */
function BackpackIcon({ className = 'w-16 h-16' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 8V6a4 4 0 00-4-4H9a4 4 0 00-4 4v2a4 4 0 00-2 3.47v8.03A2.5 2.5 0 005.5 22h13a2.5 2.5 0 002.5-2.5v-8.03A4 4 0 0019 8zM9 4h6a2 2 0 012 2v2H7V6a2 2 0 012-2zm4 7a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  );
}

/* ─── Hero Floating Cards ────────────────────────────────────────────────────── */

/* Card 1: Sticky Note — Lost Item */
function CardStickyNote() {
  return (
    <div
      className="pointer-events-auto absolute left-4 sm:left-6 lg:left-8 top-2"
      style={{ transform: 'rotate(-3deg)', transition: 'transform 0.3s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'rotate(-3deg)'}
    >
      <div className="absolute -top-3 -right-6 text-emerald-400 select-none">
        <Sparkle className="w-6 h-6" />
      </div>
      <div style={{
        width: '300px', background: '#fef9c3', borderRadius: '18px', padding: '20px',
        boxShadow: '0 15px 30px -8px rgba(217,119,6,0.15), 0 4px 6px -2px rgba(0,0,0,0.04)',
        border: '1px solid rgba(253,224,71,0.5)', position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <svg className="w-5 h-5 text-slate-800" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Lost Item</h3>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#475569',
          background: 'rgba(254,240,138,0.6)', borderRadius: '8px', padding: '6px 8px',
          border: '1px solid rgba(253,224,71,0.5)', marginBottom: '14px', flexWrap: 'wrap',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Black backpack
          </span>
          <span style={{ color: '#ca8a04', fontWeight: 700 }}>•</span>
          <span>Library</span>
          <span style={{ color: '#ca8a04', fontWeight: 700 }}>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            2:30 PM
          </span>
        </div>
        <p style={{ fontFamily: "'Caveat', cursive", fontSize: '22px', lineHeight: 1.3, color: '#1e293b', paddingLeft: '4px' }}>
          Lost my black backpack near the library. It has a blue stripe and white logo.
        </p>
        <div style={{
          position: 'absolute', bottom: '-16px', right: '16px', background: 'white',
          borderRadius: '12px', padding: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: '1px solid #f1f5f9', transform: 'rotate(6deg)',
        }}>
          <svg className="w-5 h-5 text-teal-500" fill="none" viewBox="0 0 32 32">
            <path d="M16 28C16 28 6 20.8 6 12.8C6 7.9 10.1 4 15 4C15.35 4 15.68 4.02 16 4.07C16.32 4.02 16.65 4 17 4C21.9 4 26 7.9 26 12.8C26 20.8 16 28 16 28Z" fill="url(#sticker_g)" />
            <circle cx="16" cy="13" fill="white" r="3.5" />
            <defs>
              <linearGradient id="sticker_g" x1="6" x2="26" y1="4" y2="28" gradientUnits="userSpaceOnUse">
                <stop stopColor="#34d399" /><stop offset="1" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* Card 2: AI Scan */
function CardAIScan() {
  return (
    <div
      className="pointer-events-auto absolute left-1/2 -top-2"
      style={{ transform: 'translateX(-50%)', transition: 'transform 0.3s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateX(-50%)'}
    >
      <div style={{
        background: 'white', borderRadius: '18px', padding: '16px',
        boxShadow: '0 24px 50px -12px rgba(15,23,42,0.1), 0 0 0 1px rgba(226,232,240,0.6)',
        border: '1px solid rgba(241,245,249,0.9)',
        display: 'flex', alignItems: 'center', gap: '16px', minWidth: '280px',
      }}>
        {/* Real backpack image with AI overlays */}
        <div style={{ position: 'relative', width: '96px', height: '96px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, border: '1px solid #e2e8f0' }}>
          <img
            src="/backpack.jpg"
            alt="Lost backpack"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* AI bounding box overlays */}
          <div style={{ position: 'absolute', inset: '4px', border: '2px solid rgba(52,211,153,0.95)', borderRadius: '6px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '28px', height: '22px', border: '2px solid #f97316', borderRadius: '3px', pointerEvents: 'none' }} />
          <span style={{ position: 'absolute', top: '3px', left: '3px', width: '6px', height: '6px', background: '#34d399', borderRadius: '50%' }} />
          <span style={{ position: 'absolute', top: '3px', right: '3px', width: '6px', height: '6px', background: '#34d399', borderRadius: '50%' }} />
          <span style={{ position: 'absolute', bottom: '3px', right: '3px', width: '6px', height: '6px', background: '#34d399', borderRadius: '50%' }} />
          <span style={{ position: 'absolute', bottom: '14px', right: '7px', width: '7px', height: '7px', background: '#fbbf24', borderRadius: '50%' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ color: '#f97316', fontWeight: 800, fontSize: '14px' }}>✦</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>AI Scan</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[['#34d399', 'Backpack'], ['#fbbf24', 'Blue stripe'], ['#f97316', 'Fabric'], ['#34d399', 'Zipper']].map(([color, label]) => (
              <li key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* Card 3: AI Match */
function CardAIMatch() {
  return (
    <div
      className="pointer-events-auto absolute right-4 sm:right-6 lg:right-8 top-2"
      style={{ transform: 'rotate(3deg)', transition: 'transform 0.3s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'rotate(3deg)'}
    >
      <div className="absolute -top-3 -right-3 text-emerald-400 select-none">
        <Sparkle className="w-6 h-6" />
      </div>
      <div style={{
        width: '272px', background: 'white', borderRadius: '18px', padding: '16px',
        boxShadow: '0 24px 50px -12px rgba(15,23,42,0.1), 0 0 0 1px rgba(226,232,240,0.6)',
        border: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <span style={{ color: '#f97316', fontWeight: 800, fontSize: '12px' }}>✦</span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>AI Match</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f1f5f9', flexShrink: 0 }}>
            <img src="/backpack.jpg" alt="Backpack" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#00875A', letterSpacing: '-0.02em', marginBottom: '6px' }}>94.2% match</div>
            <div style={{ width: '100%', background: '#f1f5f9', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
              <div style={{ background: '#00875A', height: '8px', borderRadius: '9999px', width: '94%' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #f8fafc', fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
          {['Color', 'Brand', 'Shape'].map(label => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 6px', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1.5px solid #94a3b8', display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Card 4: Recent Reports */
function CardRecentReports() {
  return (
    <div
      className="pointer-events-auto absolute left-4 sm:left-6 lg:left-8 bottom-0"
      style={{ transition: 'transform 0.3s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{
        width: '316px', background: 'white', borderRadius: '18px', padding: '16px',
        boxShadow: '0 24px 50px -12px rgba(15,23,42,0.1), 0 0 0 1px rgba(226,232,240,0.6)',
        border: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Reports</h4>
          </div>
          <a href="#/login" style={{ fontSize: '11px', fontWeight: 700, color: '#059669', textDecoration: 'none' }}>View all →</a>
        </div>
        {/* Backpack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BackpackIcon className="w-7 h-7 text-slate-400" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <p style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Lost - Backpack</p>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Matching</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '10px', color: '#94a3b8', marginBottom: '6px' }}>Library • 2:30 PM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '9999px', height: '6px' }}>
                <div style={{ background: '#10b981', height: '6px', borderRadius: '9999px', width: '78%' }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>78%</span>
            </div>
          </div>
        </div>
        {/* iPhone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px', borderTop: '1px solid #f8fafc' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: '20px', height: '32px', borderRadius: '3px', border: '1px solid #334155', background: '#1e293b', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '2px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#475569' }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <p style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Found - iPhone</p>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>Pending</span>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px' }}>Student Center • 11:20 AM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '9999px', height: '6px' }}>
                <div style={{ background: '#f97316', height: '6px', borderRadius: '9999px', width: '42%' }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>42%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Card 5: Secure Return */
function CardSecureReturn() {
  return (
    <div
      className="pointer-events-auto absolute right-4 sm:right-6 lg:right-8 bottom-0"
      style={{ transform: 'rotate(-2deg)', transition: 'transform 0.3s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'rotate(-2deg)'}
    >
      <div className="absolute -top-3 -right-3 text-emerald-400 select-none">
        <Sparkle className="w-6 h-6" />
      </div>
      <div style={{
        width: '300px', background: 'white', borderRadius: '18px', padding: '16px',
        boxShadow: '0 24px 50px -12px rgba(15,23,42,0.1), 0 0 0 1px rgba(226,232,240,0.6)',
        border: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Secure Return</h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '12px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(236,253,245,0.8)', border: '1px solid rgba(167,243,208,0.8)', padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[0, 1].map(i => (
                <div key={i} style={{ width: '20px', height: '20px', border: '2px solid #059669', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '8px', height: '8px', background: '#059669' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
              {[8, 6, 8].map((w, i) => <div key={i} style={{ width: `${w}px`, height: `${w}px`, background: '#059669' }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ width: '20px', height: '20px', border: '2px solid #059669', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '8px', height: '8px', background: '#059669' }} />
              </div>
              <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '2px' }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h5 style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>One-time QR code</h5>
            <p style={{ fontSize: '11px', lineHeight: 1.5, color: '#64748b', margin: 0 }}>
              Show this code at the security desk to complete the return.
            </p>
          </div>
        </div>
        <div style={{ width: '100%', background: '#ecfdf5', borderRadius: '10px', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px solid #d1fae5' }}>
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
            <path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fillRule="evenodd" />
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46' }}>Verified owner</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Data ─────────────────────────────────────────────────────────────────── */
const stats = [
  { label: 'Match Confidence', value: '94.2%', icon: '🎯' },
  { label: 'Time to File Report', value: '<60s', icon: '⚡' },
  { label: 'Organization Types', value: '6+', icon: '🏫' },
  { label: 'Data Isolation', value: '100%', icon: '🔒' },
];

const howSteps = [
  { icon: '📋', num: '01', title: 'Report', desc: 'File a lost or found report in seconds — photo optional.' },
  { icon: '🤖', num: '02', title: 'AI Understands', desc: 'Vision + language models extract category, colour, material.' },
  { icon: '🔍', num: '03', title: 'Match', desc: 'Vector similarity ranks and scores every candidate pair.' },
  { icon: '🛡️', num: '04', title: 'Verify', desc: 'A private challenge only the true owner can answer.' },
  { icon: '🤝', num: '05', title: 'Return', desc: 'QR scan, handover logged, audit trail closed.' },
];

const features = [
  { icon: '👁️', title: 'AI Item Recognition', desc: 'Vision models pull category, colour, material and condition from a single photo.' },
  { icon: '🔀', title: 'Multimodal Matching', desc: 'Image + text embeddings compared together — a blurred photo still matches.' },
  { icon: '📊', title: 'Match Evidence', desc: 'Every candidate lists the exact attributes that aligned. No black box.' },
  { icon: '🔐', title: 'Ownership Verification', desc: 'Private challenges, duplicate-claim flags and staff review protect every item.' },
  { icon: '🕐', title: 'Last-Seen Intelligence', desc: 'Checkpoint and camera timelines narrow the search to a single wing.' },
  { icon: '📱', title: 'Secure QR Handover', desc: 'One-time expiring QR codes record who handed what to whom, and when.' },
];

const orgTypes = [
  { icon: '🏫', badge: 'K-12', title: 'Schools', desc: 'Front offices return lunch boxes, jackets and textbooks without chasing parents.' },
  { icon: '🎓', badge: 'HIGH VOLUME', title: 'Universities', desc: 'Library, dorms, gym and faculty desks share one searchable inventory.' },
  { icon: '🏢', badge: 'CORPORATE', title: 'Companies', desc: 'Facilities reunite badges, laptops and headphones confidentially.' },
  { icon: '🏥', badge: 'SENSITIVE', title: 'Hospitals', desc: 'Chain-of-custody logging for valuables handled with strict privacy.' },
  { icon: '🎪', badge: 'TIME-BOXED', title: 'Events', desc: 'Spin up a temporary org for the weekend, export the log afterwards.' },
  { icon: '🌐', badge: 'MULTI-SITE', title: 'Campuses', desc: 'Shuttles, gyms, libraries operate as one coordinated network.' },
];

const faqs = [
  { q: 'How does AI matching work?', a: 'Your report becomes two embeddings — one from the photo, one from the description. Both are compared against every found item in your organization using vector similarity. Visual, textual, location and time signals are weighted into a single confidence score with ranked evidence.' },
  { q: 'How is ownership verified?', a: 'A match never releases an item alone. The claimant answers a private challenge about a detail invisible in the public feed. Staff compare the answer with the item photo and custody record, then issue a one-time expiring QR token.' },
  { q: 'Can one organization have multiple users?', a: 'Yes — unlimited members and staff accounts. Admins see the full portal (match queue, analytics, audit trail) while staff handle triage and handovers, and users only see their own reports.' },
  { q: 'Is personal information protected?', a: 'Descriptions, photos and contact details stay inside your organization and are never published publicly. Matching runs against your private index only, and contact details are revealed only to the staff member handling the handover.' },
];

const aiMatchData = [
  { label: 'Object category — backpack', value: 98 },
  { label: 'Dominant colour — black', value: 95 },
  { label: 'Detail — blue stripe', value: 91 },
  { label: 'Brand text — OCR', value: 88 },
  { label: 'Location — library zone', value: 96 },
  { label: 'Last-seen window', value: 92 },
];

/* ─── Tiny Components ───────────────────────────────────────────────────────── */
function Badge({ children, variant = 'teal' }) {
  const cls = variant === 'teal'
    ? 'bg-teal-50 text-teal-700 border border-teal-200'
    : 'bg-slate-100 text-slate-600 border border-slate-200';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${cls}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-teal-600 uppercase mb-4">
      <span className="w-4 h-[2px] bg-teal-500 rounded-full" />
      {children}
    </p>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-slate-50 transition-colors"
      >
        <span className="text-[14px] font-semibold text-slate-800">{q}</span>
        <span className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>
          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <p className="text-[13px] text-slate-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export default function LandingLink() {
  const navigate = useNavigate();
  const [dotIndex, setDotIndex] = useState(0);

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    const t = setInterval(() => setDotIndex(i => (i + 1) % 3), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen font-sans antialiased text-slate-800 overflow-x-hidden">

      {/* Font Import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap');
        .hero-dot-pattern {
          background-color: #fbfcfd;
          background-image: radial-gradient(#d1d5db 1.25px, transparent 1.25px);
          background-size: 28px 28px;
        }
        .hero-bottom-glow {
          background: radial-gradient(ellipse 70% 35% at 50% 100%, rgba(16,185,129,0.12), rgba(56,189,248,0.08) 60%, transparent 100%);
        }
      `}</style>

      {/* ══ NAV ══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/70 shadow-sm">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
          <a href="#/" className="flex items-center gap-2.5 shrink-0">
            <Logo />
          </a>

          <nav className="hidden lg:flex items-center gap-7">
            {[['how', 'How It Works'], ['features', 'Features'], ['organizations', 'Organizations'], ['ai-matching', 'AI Matching'], ['faq', 'FAQ']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-[14px] font-medium text-slate-600 hover:text-teal-700 transition-colors"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href="#/login" className="hidden sm:block text-[14px] font-semibold text-slate-700 hover:text-teal-700 transition-colors px-3 py-1.5">
              Sign In
            </a>
            <a href="#/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00875A] text-white text-[14px] font-semibold hover:bg-[#00744d] transition-all shadow-md shadow-teal-600/20">
              Get Started →
            </a>
          </div>
        </div>
      </header>

      <main>

        {/* ══ HERO — FLOATING CARDS STAGE ══════════════════════════════════════ */}
        <section className="hero-dot-pattern relative w-full overflow-hidden" style={{ minHeight: '820px' }}>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-28 flex flex-col" style={{ minHeight: '820px' }}>

            {/* TOP ROW */}
            <div className="relative w-full" style={{ minHeight: '200px' }}>
              <CardStickyNote />
              <CardAIScan />
              <CardAIMatch />
            </div>

            {/* CENTER HERO */}
            <div className="relative z-10 text-center my-14 max-w-3xl mx-auto px-4">
              <h1 style={{ fontSize: 'clamp(44px, 8vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1.06, marginBottom: '8px' }}>
                Lost something?
              </h1>
              <div style={{ fontSize: 'clamp(40px, 7vw, 68px)', fontWeight: 600, letterSpacing: '-0.03em', color: 'rgba(148,163,184,0.9)', lineHeight: 1.06, marginBottom: '24px' }}>
                Let AI find it.
              </div>
              <p style={{ fontSize: '17px', color: '#64748b', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.65 }}>
                Find, verify, and securely return lost items with AI-powered recovery intelligence.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                <a
                  href="#/login"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '10px',
                    padding: '16px 32px', borderRadius: '9999px',
                    background: '#00875A', color: 'white', fontWeight: 700, fontSize: '16px',
                    boxShadow: '0 20px 40px -8px rgba(0,135,90,0.35)',
                    textDecoration: 'none', transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#00744d'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#00875A'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <svg style={{ width: '20px', height: '20px', color: '#6ee7b7' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Report a Lost Item →
                </a>
                {/* Pagination dots */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: i === dotIndex ? '10px' : '8px', height: i === dotIndex ? '10px' : '8px', borderRadius: '50%', background: i === dotIndex ? '#00875A' : '#cbd5e1', transition: 'all 0.3s ease' }} />
                  ))}
                </div>
              </div>
            </div>

            {/* BOTTOM ROW */}
            <div className="relative w-full" style={{ minHeight: '200px' }}>
              <CardRecentReports />
              <CardSecureReturn />
            </div>

          </div>
          {/* Bottom glow */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 hero-bottom-glow z-0" />
        </section>

        {/* ══ STATS BAND ═══════════════════════════════════════════════════════ */}
        <section className="bg-white border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
              {stats.map(s => (
                <div key={s.label} className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">{s.value}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
        <section id="how" className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <SectionLabel>How It Works</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Five steps from report to return
              </h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                One platform takes an item from a hand-written note to a verified, documented handover — with your organization in control at every step.
              </p>
            </div>

            {/* Steps */}
            <div className="relative">
              {/* Connecting line (desktop) */}
              <div className="hidden lg:block absolute top-[52px] left-[12%] right-[12%] h-[2px] bg-gradient-to-r from-teal-200 via-teal-400 to-emerald-300 rounded-full" />

              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
                {howSteps.map((s, i) => (
                  <div key={s.num} className="relative flex flex-col items-center text-center group">
                    <div className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-lg z-10 transition-transform group-hover:-translate-y-1 ${i % 2 === 0 ? 'bg-teal-600 shadow-teal-600/25' : 'bg-slate-900 shadow-slate-900/25'}`}>
                      {s.icon}
                    </div>
                    <span className="text-[10px] font-bold text-teal-600 tracking-widest mb-1">{s.num}</span>
                    <h3 className="text-[15px] font-bold text-slate-900 mb-1.5">{s.title}</h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3-col callout */}
            <div className="mt-12 grid sm:grid-cols-3 gap-4">
              {[
                ['🧑‍🎓', 'Student dashboard', 'File reports, watch matches arrive, track every open case.'],
                ['🏛️', 'Organization portal', 'Staff triage matches, log custody intakes and approve recoveries.'],
                ['✅', 'Secure handover', 'QR verification + immutable audit entry for compliance.'],
              ].map(([icon, title, desc]) => (
                <div key={title} className="flex items-start gap-3.5 rounded-2xl bg-teal-50 border border-teal-100 p-5">
                  <span className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center text-lg shrink-0 shadow-md shadow-teal-600/25">{icon}</span>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900 mb-1">{title}</div>
                    <p className="text-[12px] text-slate-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ AI MATCHING ════════════════════════════════════════════════════ */}
        <section id="ai-matching" className="py-20 sm:py-28 bg-slate-950 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(#134e4a 1px,transparent 1px),linear-gradient(90deg,#134e4a 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="absolute top-1/2 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl -translate-y-1/2" />

          <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left copy */}
              <div>
                <SectionLabel>AI Matching Engine</SectionLabel>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-5 leading-tight">
                  One report in.<br />
                  <span className="text-teal-400">Ranked, evidence-backed</span> matches out.
                </h2>
                <p className="text-[15px] text-slate-400 leading-relaxed mb-8">
                  Nothing is guessed. Every match ships with the exact signals that produced it, so staff can approve confidently and owners can prove their claim.
                </p>

                {/* AI score bars */}
                <div className="space-y-3">
                  {aiMatchData.map((item, i) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-[12px] mb-1.5">
                        <span className="text-slate-400">{item.label}</span>
                        <span className="font-bold text-teal-300">{item.value}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                          style={{ width: `${item.value}%`, transition: 'width 1s ease' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500 mt-4">Embedded into the organization's private vector index · 1,284 items searched</p>
              </div>

              {/* Right: match card */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-sm">
                {/* Card header */}
                <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-teal-600 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><path d="M4 7h5l1.5-2h4L16 7h4v11H4V7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <h3 className="text-[14px] font-bold text-white">3 potential matches</h3>
                  </div>
                  <Badge variant="teal">Stanford University</Badge>
                </div>

                {/* Top match */}
                <div className="rounded-2xl border-2 border-teal-500 bg-teal-500/10 p-4 mb-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[13px] font-bold text-white mb-0.5">Black backpack with blue stripe</div>
                      <div className="text-[11px] text-slate-400">Library · Lost &amp; Found desk · 2:41 PM</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[26px] font-extrabold text-teal-400 leading-none">94%</div>
                      <div className="text-[9px] font-bold text-slate-500">MATCH</div>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden mb-3">
                    <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: '94%' }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {['Color ✓', 'Shape ✓', 'Brand ✓', 'Location ✓', 'Time ✓'].map(t => (
                      <span key={t} className="text-[10px] font-semibold text-teal-300 bg-teal-500/20 border border-teal-500/30 rounded-md px-2 py-0.5">{t}</span>
                    ))}
                  </div>
                  <button onClick={() => navigate('/login')} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 text-white px-4 py-2 text-[12px] font-bold hover:bg-teal-500 transition">
                    Try it now →
                  </button>
                </div>

                {/* Secondary matches */}
                {[{ label: 'Black laptop sleeve · Gym entrance', pct: 78 }, { label: 'Navy duffel bag · Sports complex', pct: 61 }].map(m => (
                  <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-3.5 mb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-slate-400">{m.label}</span>
                      <span className="text-[12px] font-bold text-slate-500">{m.pct}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES ═══════════════════════════════════════════════════════ */}
        <section id="features" className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <SectionLabel>Core Features</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Six capabilities that make recovery reliable
              </h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                Every feature exists to answer one question honestly: <em>is this really the owner's item?</em>
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f, i) => (
                <div key={f.title} className={`group rounded-2xl p-6 border transition-all hover:-translate-y-1 hover:shadow-lg ${i === 0 ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-100 shadow-sm'}`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4 ${i === 0 ? 'bg-white/20' : 'bg-teal-50'}`}>{f.icon}</div>
                  <h3 className={`text-[15px] font-bold mb-2 ${i === 0 ? 'text-white' : 'text-slate-900'}`}>{f.title}</h3>
                  <p className={`text-[13px] leading-relaxed ${i === 0 ? 'text-teal-100' : 'text-slate-500'}`}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ ORGANIZATIONS ══════════════════════════════════════════════════ */}
        <section id="organizations" className="py-20 sm:py-28 bg-slate-50">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mb-14">
              <SectionLabel>For Organizations</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Built for any place that collects lost property
              </h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                The same AI engine adapts to schools, colleges, companies, hospitals, event venues and whole campuses — each with its own staff, reports and data boundary.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {orgTypes.map(o => (
                <div key={o.title} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <span className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl">{o.icon}</span>
                    <Badge>{o.badge}</Badge>
                  </div>
                  <h3 className="text-[15px] font-bold text-slate-900 mb-1.5">{o.title}</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed mb-3">{o.desc}</p>
                  <div className="text-[11px] font-semibold text-slate-400 pt-3 border-t border-slate-100">
                    Multiple staff accounts · role-based access
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ MULTI-TENANT DARK SECTION ═══════════════════════════════════════ */}
        <section className="py-20 sm:py-28 bg-slate-950 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#134e4a 1px,transparent 1px),linear-gradient(90deg,#134e4a 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <SectionLabel>Multi-Organization by Design</SectionLabel>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-5">
                  One platform,{' '}
                  <span className="text-teal-400">many isolated</span> organizations
                </h2>
                <p className="text-[15px] text-slate-400 leading-relaxed mb-8">
                  A university and a hospital can run on the same LostLink AI deployment while never seeing each other's items, staff or reports. Tenancy is enforced in the data layer, not just the interface.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    ['Organization-specific reports', 'Every item belongs to exactly one organization.'],
                    ['Organization-specific users', 'Membership decides what you can see.'],
                    ['Role-based access', 'Students report, staff triage, admins oversee.'],
                    ['Isolated AI search', 'Vectors never cross tenant boundaries.'],
                  ].map(([t, d]) => (
                    <div key={t} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <svg className="w-4 h-4 text-teal-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span className="text-[12px] font-bold text-white">{t}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{d}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Org switcher card */}
              <div className="bg-white rounded-2xl shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <span className="text-[13px] font-bold text-slate-900">Your organizations</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">SWITCH ANYTIME</span>
                </div>
                <div className="space-y-2.5">
                  <div className="rounded-xl border-2 border-teal-400 bg-teal-50 p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-bold text-slate-900">Stanford University</span>
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">ACTIVE</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Admin · 4 staff · 1,284 items · library, dorms, gym</p>
                  </div>
                  {[
                    { name: 'Northline General Hospital', role: 'STAFF', info: '6 staff · 312 items · custody desk' },
                    { name: 'Globex Corporation', role: 'MEMBER', info: '3 staff · 98 items · HQ floors 1–9' },
                  ].map(o => (
                    <div key={o.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-700">{o.name}</span>
                        <span className="text-[10px] font-semibold text-slate-400">{o.role}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{o.info}</p>
                    </div>
                  ))}
                </div>
                <a href="#/login" className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-teal-700 hover:underline">
                  Open the organization portal →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ══ SECURITY ═══════════════════════════════════════════════════════ */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <SectionLabel>Secure Recovery</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Five gates between a claim and a handover
              </h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                Free items attract false claims. LostLink AI makes every handover provable: a challenge only the owner can answer, a token that expires, and a log nobody can edit.
              </p>
            </div>

            {/* Step row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
              {[
                { num: '01', title: 'Match', desc: 'AI proposes candidates with evidence and confidence score.' },
                { num: '02', title: 'Challenge', desc: 'Claimant answers a question never shown publicly.' },
                { num: '03', title: 'Verify', desc: 'Staff compare the answer, photos and custody record.' },
                { num: '04', title: 'QR Token', desc: 'One-time, expiring code issued to verified owner only.' },
                { num: '05', title: 'Return', desc: 'Scan, sign, close the case. Audit entry is permanent.' },
              ].map((s, i) => (
                <div key={s.num} className={`rounded-2xl p-5 ${i % 2 === 0 ? 'bg-teal-600 text-white' : 'bg-slate-900 text-white'}`}>
                  <div className="text-[11px] font-bold tracking-widest text-white/50 mb-3">{s.num}</div>
                  <h3 className="text-[15px] font-bold text-white mb-2">{s.title}</h3>
                  <p className="text-[12px] text-white/70 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* 2-col detail */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6">
                <h3 className="text-[15px] font-bold text-slate-900 mb-5">What stops a false claim</h3>
                <div className="space-y-4">
                  {[
                    ['Hidden detail challenge', 'A scratch, sticker, locked-screen photo — details never in the public feed.'],
                    ['Duplicate claim detection', 'If two people claim the same item, both cases escalate to staff review.'],
                    ['Single-use QR codes', 'Tokens expire in minutes and cannot be reused or shared.'],
                    ['Immutable audit trail', 'Every action records staff identity, timestamp and status change.'],
                  ].map(([t, d]) => (
                    <div key={t} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">✓</span>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">{t}</div>
                        <p className="text-[12px] text-slate-500 leading-relaxed">{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Challenge card mockup */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <span className="text-[13px] font-bold text-slate-900">Ownership challenge · LL-1042</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">AWAITING VERIFICATION</span>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-4">
                  <div className="text-[10px] font-bold text-slate-400 mb-2 tracking-widest">PRIVATE QUESTION</div>
                  <p className="text-[14px] text-slate-800 mb-4">What is written on the tag inside the front pocket?</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-slate-400 tracking-widest">••••••••••</span>
                    <a href="#/login" className="rounded-xl bg-teal-600 text-white px-4 py-2.5 text-[12px] font-bold hover:bg-teal-500 transition">Verify</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  {[['Challenge attempts', '1 of 3'], ['Other open claims', '0'], ['Days in custody', '2'], ['Custody holder', 'Library desk 2']].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-semibold text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ DASHBOARDS PREVIEW ══════════════════════════════════════════════ */}
        <section className="py-20 sm:py-28 bg-slate-50">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <SectionLabel>Dashboard Preview</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Two dashboards, one recovery workflow
              </h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                File a report in one — it appears in the other immediately. Everything is live in this demo.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Student dashboard */}
              <div className="rounded-2xl bg-white border border-slate-100 shadow-card overflow-hidden flex flex-col">
                <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 text-[10px] font-mono text-slate-500">Student Dashboard</span>
                </div>
                <div className="p-5 flex-1">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[['4', 'Open reports', 'slate'], ['3', 'AI matches', 'teal'], ['12', 'Recovered', 'slate']].map(([v, l, c]) => (
                      <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                        <div className={`text-[18px] font-extrabold leading-none mb-1 ${c === 'teal' ? 'text-teal-600' : 'text-slate-900'}`}>{v}</div>
                        <div className="text-[10px] text-slate-400">{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5 mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-bold text-slate-900">Strong match · LL-1042</span>
                      <span className="text-[13px] font-extrabold text-teal-600">94%</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2.5">Black backpack with blue stripe found at the library desk.</p>
                    <span className="inline-flex items-center rounded-lg bg-teal-600 text-white px-3 py-1.5 text-[11px] font-bold">Verify &amp; claim</span>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden text-[11px]">
                    <div className="grid grid-cols-4 px-3 py-2 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase">
                      <span>Item</span><span>Type</span><span>Status</span><span className="text-right">Match</span>
                    </div>
                    {[['Backpack', 'Lost', 'Matched', '94%', 'teal'], ['iPhone 14', 'Found', 'Claimed', '78%', 'amber']].map(([item, type, status, pct, color]) => (
                      <div key={item} className="grid grid-cols-4 px-3 py-2 border-t border-slate-50">
                        <span className="font-semibold text-slate-800">{item}</span>
                        <span className="text-slate-500">{type}</span>
                        <span className={`font-semibold ${color === 'teal' ? 'text-teal-700' : 'text-amber-700'}`}>{status}</span>
                        <span className="text-right font-bold text-slate-900">{pct}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-slate-100">
                  <p className="text-[12px] text-slate-500 mb-3">Report, watch matches, run the ownership challenge and hold the QR token.</p>
                  <a href="#/login" className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 text-white px-4 py-2.5 text-[12px] font-bold hover:bg-teal-500 transition">
                    Open student dashboard →
                  </a>
                </div>
              </div>

              {/* Org dashboard */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-card overflow-hidden flex flex-col">
                <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-800 border-b border-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 text-[10px] font-mono text-slate-400">Organization Dashboard</span>
                </div>
                <div className="p-5 flex-1">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[['27', 'In custody', false], ['6', 'Awaiting decision', true], ['94%', 'Match accuracy', false]].map(([v, l, hi]) => (
                      <div key={l} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                        <div className={`text-[18px] font-extrabold leading-none mb-1 ${hi ? 'text-teal-400' : 'text-white'}`}>{v}</div>
                        <div className="text-[10px] text-slate-500">{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-white/10 overflow-hidden mb-3 text-[11px]">
                    <div className="grid grid-cols-4 px-3 py-2 bg-white/5 text-[9px] font-bold text-slate-500 uppercase">
                      <span>Pair</span><span>Conf.</span><span>Zone</span><span className="text-right">Action</span>
                    </div>
                    {[['LL-1042 ↔ F-882', '94%', 'Library', 'Approve', true], ['LL-1040 ↔ F-879', '78%', 'Gym', 'Triage', false]].map(([pair, conf, zone, action, hi]) => (
                      <div key={pair} className="grid grid-cols-4 px-3 py-2 border-t border-white/5 items-center">
                        <span className="font-semibold text-slate-300">{pair}</span>
                        <span className={`font-bold ${hi ? 'text-teal-400' : 'text-amber-400'}`}>{conf}</span>
                        <span className="text-slate-400">{zone}</span>
                        <span className="text-right">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${hi ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300'}`}>{action}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-black/30 border border-white/5 p-3.5">
                    <div className="text-[10px] font-bold text-teal-400 mb-2 tracking-widest">AUDIT TRAIL</div>
                    <ul className="space-y-1 text-[11px] text-slate-400">
                      <li>10:41 AM · Dana W. approved LL-1042 (94%)</li>
                      <li>10:44 AM · QR token issued · expires in 10 min</li>
                      <li>10:47 AM · Handover logged · case closed</li>
                    </ul>
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-slate-800">
                  <p className="text-[12px] text-slate-400 mb-3">Triage the AI match queue, log custody intakes, approve recoveries and review analytics.</p>
                  <a href="#/login" className="inline-flex items-center gap-1.5 rounded-xl bg-white text-slate-900 px-4 py-2.5 text-[12px] font-bold hover:bg-slate-100 transition">
                    Open organization portal →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
        <section id="faq" className="py-20 sm:py-28 bg-white">
          <div className="max-w-3xl mx-auto px-5 sm:px-8">
            <div className="text-center mb-14">
              <SectionLabel>FAQ</SectionLabel>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                Common questions
              </h2>
              <p className="text-[15px] text-slate-500">Everything you need to know before getting started.</p>
            </div>
            <div className="space-y-3">
              {faqs.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>

        {/* ══ CTA BANNER ══════════════════════════════════════════════════════ */}
        <section className="py-20 bg-gradient-to-br from-teal-600 to-teal-800 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'linear-gradient(white 1px,transparent 1px),linear-gradient(90deg,white 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-5">
              Ready to get started?
            </h2>
            <p className="text-[17px] text-teal-100 leading-relaxed mb-10">
              Join organizations that have replaced paper logs and phone chains with AI-powered recovery.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="#/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-teal-700 font-bold text-[16px] hover:bg-teal-50 transition shadow-xl shadow-teal-900/20">
                Get Started Free →
              </a>
              <a href="#/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border-2 border-white/40 text-white font-bold text-[16px] hover:bg-white/10 transition">
                Sign In
              </a>
            </div>
          </div>
        </section>

        {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
        <footer className="bg-slate-950 text-slate-400 py-12">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <a href="#/" className="flex items-center gap-2">
                <Logo />
                <span className="text-[16px] font-extrabold text-white">LostLink <span className="text-teal-500">AI</span></span>
              </a>
              <nav className="flex flex-wrap items-center justify-center gap-6 text-[13px]">
                {[['how', 'How It Works'], ['features', 'Features'], ['organizations', 'Organizations'], ['ai-matching', 'AI Matching'], ['faq', 'FAQ']].map(([id, label]) => (
                  <button key={id} onClick={() => scrollTo(id)} className="hover:text-white transition-colors">{label}</button>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                <a href="#/login" className="text-[13px] hover:text-white transition-colors">Sign In</a>
                <a href="#/login" className="px-4 py-2 rounded-full bg-teal-600 text-white text-[13px] font-semibold hover:bg-teal-500 transition">Get Started</a>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-white/5 text-center text-[12px]">
              © {new Date().getFullYear()} LostLink AI · Built for organizations that care about what people lose.
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}