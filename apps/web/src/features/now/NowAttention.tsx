import React from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { AttentionItem } from './nowModel';

/** "Needs a look": shown only when a rule fires. */
export function NowAttention({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return <section className="now-card now-attention" aria-labelledby="now-attention-title">
    <h2 id="now-attention-title" className="now-section-title">Needs a look</h2>
    <ul>
      {items.map(item => <li key={item.id}>
        <Link to={item.to} search={item.search as never} className="now-attention-row">
          <span className="now-attention-dot" aria-hidden="true" />
          <span className="now-attention-text"><strong>{item.title}</strong><small>{item.detail}</small></span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </section>;
}
