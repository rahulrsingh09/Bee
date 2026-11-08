import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { InsightsHub, isInsightTab } from '../features/insights/InsightsHub';

const insightsParentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/insights',
});

/** "/insights" opens the Cost tab. */
const insightsIndexRoute = createRoute({
  getParentRoute: () => insightsParentRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/insights/$tab', params: { tab: 'cost' }, replace: true }); },
});

/** "/insights/cost", "/insights/charging", "/insights/battery", "/insights/efficiency", "/insights/lifetime". */
export const insightsTabRoute = createRoute({
  getParentRoute: () => insightsParentRoute,
  path: '$tab',
  beforeLoad: ({ params }) => {
    if (!isInsightTab(params.tab)) throw redirect({ to: '/insights/$tab', params: { tab: 'cost' }, replace: true });
  },
  component: function InsightsTabPage() {
    const { tab } = insightsTabRoute.useParams();
    return <ProtectedRoute><InsightsHub tab={isInsightTab(tab) ? tab : 'cost'} /></ProtectedRoute>;
  },
});

export const insightsRoute = insightsParentRoute.addChildren([insightsIndexRoute, insightsTabRoute]);
