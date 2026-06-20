import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTrayActions = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'test-tray',
    label: '后端托盘动作',
    description: '来自本地后端的托盘动作',
    enabled: true,
  },
]));

vi.mock('@/api/client', () => ({
  backendClient: {
    listTrayActions,
  },
}));

import { TrayMenuPreview } from './TrayMenuPreview';

describe('TrayMenuPreview', () => {
  beforeEach(() => {
    listTrayActions.mockClear();
  });

  it('loads tray actions from the backend client', async () => {
    render(<TrayMenuPreview />);

    expect(await screen.findByText('后端托盘动作')).toBeInTheDocument();
    expect(screen.getByText('来自本地后端的托盘动作')).toBeInTheDocument();
    expect(listTrayActions).toHaveBeenCalledOnce();
  });
});
