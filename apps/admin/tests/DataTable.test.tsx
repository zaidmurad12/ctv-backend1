import test from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from '../src/components/common/DataTable';

interface Row {
  readonly id: string;
  readonly title: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'title', label: 'Title', render: (row) => row.title },
];

function noop() {}

test('DataTable renders rows and column headers', () => {
  const rows: Row[] = [
    { id: '1', title: 'The Matrix' },
    { id: '2', title: 'Inception' },
  ];

  render(
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      isLoading={false}
      page={1}
      limit={20}
      total={2}
      onPageChange={noop}
      onLimitChange={noop}
    />,
  );

  assert.ok(screen.getByText('Title'));
  assert.ok(screen.getByText('The Matrix'));
  assert.ok(screen.getByText('Inception'));
  cleanup();
});

test('DataTable shows the empty state when there are no rows', () => {
  render(
    <DataTable
      columns={columns}
      rows={[]}
      getRowId={(row) => row.id}
      isLoading={false}
      page={1}
      limit={20}
      total={0}
      onPageChange={noop}
      onLimitChange={noop}
      emptyTitle="No movies found"
    />,
  );

  assert.ok(screen.getByText('No movies found'));
  cleanup();
});

test('DataTable calls onSearchChange as the user types', async () => {
  const user = userEvent.setup();
  let latestSearch = '';

  render(
    <DataTable
      columns={columns}
      rows={[]}
      getRowId={(row) => row.id}
      isLoading={false}
      page={1}
      limit={20}
      total={0}
      onPageChange={noop}
      onLimitChange={noop}
      search=""
      onSearchChange={(value) => {
        latestSearch = value;
      }}
      searchPlaceholder="Search movies…"
    />,
  );

  const input = screen.getByPlaceholderText('Search movies…');
  await user.type(input, 'a');
  assert.equal(latestSearch, 'a');
  cleanup();
});
