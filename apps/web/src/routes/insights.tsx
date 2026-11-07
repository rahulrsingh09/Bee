import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { InsightsHub } from '../features/insights/InsightsHub';

export const insightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/insights',
  component: () => <ProtectedRoute><InsightsHub /></ProtectedRoute>,
});
