import React from 'react';
import { NowBody } from '../now/NowPage';

/**
 * "/" renders the Now page directly (routes/index.tsx). A dashboard shell that still asks
 * for the R overview on "/" gets the same Now body instead of the former dashboard layout.
 */
export function ROverview(_props: { state: unknown; actions: React.ReactNode }) {
  return <NowBody />;
}
