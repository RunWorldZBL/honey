import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ruleStore = vi.hoisted(() => ({
  items: [
    {
      id: 'rule-test',
      name: '测试规则',
      pattern: '测试输入',
      replacement: '测试输出',
      isRegex: false,
      enabled: true,
    },
  ],
}));

const listRules = vi.hoisted(() => vi.fn(async () => ruleStore.items));
const saveRule = vi.hoisted(() => vi.fn(async (rule) => {
  ruleStore.items = [rule, ...ruleStore.items.filter(item => item.id !== rule.id)];
  return rule;
}));
const previewRules = vi.hoisted(() => vi.fn(async (input: string) => input.replace('测试输入', '测试输出')));

vi.mock('@/api/client', () => ({
  backendClient: {
    listRules,
    saveRule,
    previewRules,
  },
}));

import { RulesPage } from './RulesPage';

describe('RulesPage', () => {
  beforeEach(() => {
    ruleStore.items = [
      {
        id: 'rule-test',
        name: '测试规则',
        pattern: '测试输入',
        replacement: '测试输出',
        isRegex: false,
        enabled: true,
      },
    ];
    listRules.mockClear();
    saveRule.mockClear();
    previewRules.mockClear();
  });

  it('loads rules and previews replacement output through the backend client', async () => {
    const user = userEvent.setup();
    render(<RulesPage />);

    expect(await screen.findByText('测试规则')).toBeInTheDocument();
    expect(listRules).toHaveBeenCalledOnce();

    await user.clear(screen.getByLabelText('测试输入'));
    await user.type(screen.getByLabelText('测试输入'), '请处理测试输入');

    expect(await screen.findByText('请处理测试输出')).toBeInTheDocument();
    expect(previewRules).toHaveBeenLastCalledWith('请处理测试输入');

    await user.type(screen.getByLabelText('规则名称'), 'Qwen 昵称');
    await user.type(screen.getByLabelText('匹配内容'), '扣文');
    await user.type(screen.getByLabelText('替换为'), 'Qwen');
    await user.click(screen.getByRole('button', { name: '保存规则' }));

    expect(screen.getByText('Qwen 昵称')).toBeInTheDocument();
    expect(saveRule).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Qwen 昵称',
      pattern: '扣文',
      replacement: 'Qwen',
    }));
  });
});
