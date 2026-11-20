import { describe, it, expect } from 'vitest';
import { getVisibleNavGroups, isNavItemVisible, NAV_GROUPS } from './navItems';

const overviewItem = NAV_GROUPS[0].items[0];
const branchesItem = NAV_GROUPS[2].items[0];

describe('Navigation visibility', () => {
  it('shows an entry whose required scopes are empty', () => {
    expect(
      isNavItemVisible(overviewItem, {
        roles: ['Cashier'],
        scopes: ['inventory:read'],
        runtime: 'Cloud',
      })
    ).toBe(true);
  });

  it('hides an entry whose required scope is missing', () => {
    expect(
      isNavItemVisible(branchesItem, {
        roles: ['Admin'],
        scopes: ['inventory:read'],
        runtime: 'Cloud',
      })
    ).toBe(false);
  });

  it('hides an entry when the runtime is unknown', () => {
    expect(
      isNavItemVisible(overviewItem, {
        roles: ['Admin'],
        scopes: ['inventory:read'],
        runtime: null,
      })
    ).toBe(false);
  });

  it('drops the groups that keep no visible entry', () => {
    const groups = getVisibleNavGroups(NAV_GROUPS, {
      roles: ['Pharmacist'],
      scopes: ['inventory:read'],
      runtime: 'BranchLocal',
    });

    const labels = groups.flatMap((group) =>
      group.items.map((item) => item.label)
    );

    expect(labels).toContain('Products');
    expect(labels).toContain('Inventory');
    expect(labels).not.toContain('Branches');
    expect(labels).not.toContain('User Accounts');
  });
});
