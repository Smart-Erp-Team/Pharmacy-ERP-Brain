/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './Table';

afterEach(() => {
  cleanup();
});

describe('Table primitives', () => {
  it('renders the header and the body rows', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead numeric>On hand</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Amoxicillin</TableCell>
            <TableCell numeric>12</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('columnheader', { name: 'Product' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Amoxicillin' })).toBeDefined();
    expect(screen.getByRole('cell', { name: '12' })).toBeDefined();
  });

  it('right aligns the numeric columns', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead numeric>On hand</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Amoxicillin</TableCell>
            <TableCell numeric>12</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const numericHead = screen.getByRole('columnheader', { name: 'On hand' });
    const numericCell = screen.getByRole('cell', { name: '12' });

    expect(numericHead.className).toContain('text-right');
    expect(numericCell.className).toContain('text-right');
  });

  it('exposes the sort state and reports a sort request', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();

    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sortDirection="ascending" onSort={onSort}>
              Product
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Amoxicillin</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const head = screen.getByRole('columnheader', { name: 'Product' });
    expect(head.getAttribute('aria-sort')).toBe('ascending');

    await user.click(screen.getByRole('button', { name: 'Product' }));
    expect(onSort).toHaveBeenCalledTimes(1);
  });
});
