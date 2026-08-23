'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Facebook,
  Instagram,
  Link,
  Pencil,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from 'lucide-react';
import styles from './content-engine.module.css';

type Status = 'pending' | 'approved' | 'rejected';

type ContentItem = {
  id: number;
  platform: string;
  format: string;
  time: string;
  copy: string;
  goal: string;
  accent: string;
  status: Status;
};

const seedItems: ContentItem[] = [
  {
    id: 1,
    platform: 'Instagram',
    format: 'Feed post',
    time: '9:00 AM',
    copy: 'Turn one strong customer result into a story your next customer can instantly understand.',
    goal: 'Proof',
    accent: 'pink',
    status: 'pending',
  },
  {
    id: 2,
    platform: 'Facebook',
    format: 'Post',
    time: '11:00 AM',
    copy: 'The three questions buyers should ask before choosing a service provider — and how we answer each one.',
    goal: 'Authority',
    accent: 'blue',
    status: 'pending',
  },
  {
    id: 3,
    platform: 'LinkedIn',
    format: 'Carousel',
    time: '1:00 PM',
    copy: 'A concise breakdown of the process behind a recent win, written for decision-makers.',
    goal: 'Authority',
    accent: 'cyan',
    status: 'pending',
  },
  {
    id: 4,
    platform: 'Instagram',
    format: 'Story',
    time: '4:00 PM',
    copy: 'Quick poll: what is the biggest thing stopping you from taking the next step?',
    goal: 'Engagement',
    accent: 'violet',
    status: 'pending',
  },
  {
    id: 5,
    platform: 'Facebook',
    format: 'Offer post',
    time: '6:00 PM',
    copy: 'A direct offer built around today’s highest-performing customer pain point and a simple next action.',
    goal: 'Lead generation',
    accent: 'amber',
    status: 'pending',
  },
];

const metrics = [
  ['Reach', '18.7K', '+24%'],
  ['Engagement', '1.6K', '+28%'],
  ['Clicks', '612', '+31%'],
  ['Leads', '23', '+21%'],
];

export default function ContentEnginePage() {
  const [items, setItems] = useState(seedItems);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved'>('all');

  const filtered = useMemo(
    () => items.filter((item) => activeTab === 'all' || item.status === activeTab),
    [items, activeTab],
  );

  const approved = items.filter((item) => item.status === 'approved').length;
  const pending = items.filter((item) => item.status === 'pending').length;

  const setStatus = (id: number, status: Status) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const replace = (id: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              copy: 'Fresh AI replacement: a clearer hook, stronger proof point and one focused call to action.',
              status: 'pending',
            }
          : item,
      ),
    );
  };

  const approveAll = () => setItems((current) => current.map((item) => ({ ...item, status: 'approved' })));

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}><Sparkles size={14} /> Orbit · Content Engine</div>
          <h1>Your daily content loop</h1>
          <p>Generate once, approve once, let Orbit schedule, post and learn for the rest of the day.</p>
        </div>
        <div className={styles.loopState}><CircleDot size={15} /> Daily loop active</div>
      </header>

      <section className={styles.flow}>
        {['Plan + Generate', 'Daily Approval', 'Auto-Post', 'Learn + Improve'].map((label, index) => (
          <div className={styles.flowStep} key={label}>
            <span>{index + 1}</span>
            <strong>{label}</strong>
            {index < 3 && <ChevronRight size={18} />}
          </div>
        ))}
      </section>

      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}><Zap size={18} /><span>Today’s batch</span><strong>{items.length} pieces</strong><small>{pending} waiting for approval</small></article>
        <article className={styles.metricCard}><Check size={18} /><span>Approval progress</span><strong>{approved}/{items.length}</strong><small>{Math.round((approved / items.length) * 100)}% approved</small></article>
        <article className={styles.metricCard}><Target size={18} /><span>Today’s focus</span><strong>Proof + Leads</strong><small>Based on yesterday’s response</small></article>
        <article className={styles.metricCard}><CalendarDays size={18} /><span>Next batch</span><strong>6:00 AM</strong><small>Generated automatically tomorrow</small></article>
      </section>

      <div className={styles.workspace}>
        <section className={styles.approvalPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>Daily approval</span>
              <h2>Review today’s content batch</h2>
            </div>
            <button className={styles.primaryButton} onClick={approveAll}><Check size={16} /> Approve all</button>
          </div>

          <div className={styles.tabs}>
            {(['all', 'pending', 'approved'] as const).map((tab) => (
              <button key={tab} className={activeTab === tab ? styles.activeTab : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
            ))}
          </div>

          <div className={styles.contentList}>
            {filtered.map((item) => (
              <article className={styles.contentCard} key={item.id}>
                <div className={`${styles.preview} ${styles[item.accent]}`}>
                  <span>{item.goal}</span>
                  <strong>{item.platform}</strong>
                </div>
                <div className={styles.contentBody}>
                  <div className={styles.contentMeta}>
                    <span>{item.platform} · {item.format}</span>
                    <span><Clock3 size={13} /> {item.time}</span>
                  </div>
                  <p>{item.copy}</p>
                  <div className={styles.goalTag}>{item.goal}</div>
                </div>
                <div className={styles.actions}>
                  <button aria-label="Edit content"><Pencil size={15} /></button>
                  <button onClick={() => replace(item.id)}><RefreshCw size={15} /> Replace</button>
                  <button className={styles.reject} onClick={() => setStatus(item.id, 'rejected')}><Trash2 size={15} /> Reject</button>
                  <button className={item.status === 'approved' ? styles.approvedButton : styles.approveButton} onClick={() => setStatus(item.id, 'approved')}><Check size={15} /> {item.status === 'approved' ? 'Approved' : 'Approve'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.sidePanel}>
            <div className={styles.panelHeaderCompact}><div><span className={styles.sectionLabel}>Auto-posting</span><h3>Today’s schedule</h3></div><span className={styles.live}>Live</span></div>
            <div className={styles.schedule}>
              {items.map((item) => (
                <div className={styles.scheduleRow} key={item.id}>
                  <span className={styles.platformIcon}>{item.platform === 'Instagram' ? <Instagram size={15} /> : item.platform === 'Facebook' ? <Facebook size={15} /> : <Link size={15} />}</span>
                  <div><strong>{item.time}</strong><small>{item.platform} · {item.format}</small></div>
                  <span className={item.status === 'approved' ? styles.ready : styles.waiting}>{item.status === 'approved' ? 'Ready' : 'Waiting'}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sidePanel}>
            <div className={styles.panelHeaderCompact}><div><span className={styles.sectionLabel}>Yesterday</span><h3>Performance</h3></div><BarChart3 size={19} /></div>
            <div className={styles.performanceGrid}>
              {metrics.map(([label, value, delta]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{delta}</small></div>)}
            </div>
          </section>

          <section className={`${styles.sidePanel} ${styles.learningPanel}`}>
            <div className={styles.learningIcon}><Sparkles size={20} /></div>
            <div><span className={styles.sectionLabel}>Orbit is learning</span><h3>Tomorrow’s adjustment</h3><p>Customer proof and concise educational posts produced the best engagement. Tomorrow’s plan will increase both while reducing generic promotional content.</p></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
