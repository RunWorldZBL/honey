import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hotwordStore = vi.hoisted(() => ({
  items: [
    {
      id: 'hotword-test',
      canonical: '测试热词',
      aliases: ['测试别名'],
      blacklist: [],
      enabled: true,
    },
  ],
}));

const listHotwords = vi.hoisted(() => vi.fn(async () => hotwordStore.items));
const saveHotword = vi.hoisted(() => vi.fn(async (entry) => {
  hotwordStore.items = [entry, ...hotwordStore.items.filter(item => item.id !== entry.id)];
  return entry;
}));
const deleteHotword = vi.hoisted(() => vi.fn(async (id: string) => {
  hotwordStore.items = hotwordStore.items.filter(item => item.id !== id);
  return { ok: true as const, id };
}));

vi.mock('@/api/client', () => ({
  backendClient: {
    listHotwords,
    saveHotword,
    deleteHotword,
  },
}));

import { HotwordsPage } from './HotwordsPage';

describe('HotwordsPage', () => {
  beforeEach(() => {
    hotwordStore.items = [
      {
        id: 'hotword-test',
        canonical: '测试热词',
        aliases: ['测试别名'],
        blacklist: [],
        enabled: true,
      },
    ];
    listHotwords.mockClear();
    saveHotword.mockClear();
    deleteHotword.mockClear();
  });

  it('renders canonical word, aliases, and blacklist fields', async () => {
    render(<HotwordsPage />);

    expect(screen.getByText('热词')).toBeInTheDocument();
    expect(await screen.findByText('测试热词')).toBeInTheDocument();
    expect(screen.getByLabelText('标准词')).toBeInTheDocument();
    expect(screen.getByLabelText('别名')).toBeInTheDocument();
    expect(screen.getByLabelText('黑名单')).toBeInTheDocument();
    expect(listHotwords).toHaveBeenCalledOnce();
  });

  it('updates the selected hotword and can disable it locally', async () => {
    const user = userEvent.setup();
    render(<HotwordsPage />);

    await screen.findByText('测试热词');
    await user.clear(screen.getByLabelText('标准词'));
    await user.type(screen.getByLabelText('标准词'), 'OpenAI');
    await user.clear(screen.getByLabelText('别名'));
    await user.type(screen.getByLabelText('别名'), '欧盆 AI、开放人工智能');
    await user.click(screen.getByRole('button', { name: '保存热词' }));

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('欧盆 AI、开放人工智能')).toBeInTheDocument();
    expect(saveHotword).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '停用热词' }));

    expect(screen.getByRole('button', { name: '启用热词' })).toBeInTheDocument();
    expect(screen.getAllByText('停用').length).toBeGreaterThan(0);
    expect(saveHotword).toHaveBeenCalledWith(expect.objectContaining({
      canonical: 'OpenAI',
      enabled: false,
    }));
  });
});
