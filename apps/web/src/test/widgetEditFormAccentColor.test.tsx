import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../../packages/dashboards/src/widgets/sensor/SensorChipWidget';
import { WidgetEditForm } from '../../../../packages/dashboards/src/editor/WidgetEditForm';
import type { WidgetInstance } from '../../../../packages/dashboards/src/schema';

vi.mock('@riviamigo/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@riviamigo/hooks')>();
  return { ...actual, useMetricCatalog: () => ({ data: [] }) };
});

vi.mock('../../../../packages/dashboards/src/editor/IconPicker', () => ({
  IconPicker: () => null,
}));

const sensor = (options: Record<string, unknown> = {}): WidgetInstance => ({
  id: '22222222-2222-2222-2222-222222222222',
  componentType: 'sensor',
  definitionId: 'total_miles',
  title: 'Miles',
  layout: { x: 0, y: 0, w: 3, h: 2 },
  options,
});

describe('WidgetEditForm sensor accent color', () => {
  it('replaces the no-op "Value color" control with "Accent color" and one help line', () => {
    render(<WidgetEditForm widget={sensor()} onChange={vi.fn()} onClose={() => undefined} />);

    expect(screen.queryByText('Value color')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Value color' })).toBeNull();
    const field = screen.getByTestId('sensor-accent-color');
    expect(within(field).getByText('Accent color')).toBeInTheDocument();
    expect(within(field).getByText('Sets the color of the icon, sprite and border. The number stays in the text color.')).toBeInTheDocument();
  });

  it('keeps the accent color control when the background graph is off', () => {
    const onChange = vi.fn();
    render(<WidgetEditForm widget={sensor({ showSprite: false })} onChange={onChange} onClose={() => undefined} />);

    const field = screen.getByTestId('sensor-accent-color');
    fireEvent.click(within(field).getByRole('button', { name: 'Theme accent color' }));
    fireEvent.click(screen.getByRole('option', { name: /Accent 03 series-03/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      options: expect.objectContaining({ curveColor: 'series-03' }),
    }));
  });
});
