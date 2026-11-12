const TABLE = {
  filter: ['Table.SelectRows', 'Table.RemoveRowsWithErrors', 'Table.SelectRowsWithErrors', 'Table.FirstN', 'Table.LastN', 'Table.Skip', 'Table.Range', 'Table.RemoveFirstN', 'Table.RemoveLastN', 'Table.Distinct', 'Table.AlternateRows', 'Table.RemoveMatchingRows', 'Table.FindText', 'Table.Repeat', 'Table.RemoveRows', 'Table.FillDown', 'Table.FillUp'],
  sort: ['Table.Sort', 'Table.ReverseRows'],
  'add-column': ['Table.AddColumn', 'Table.AddIndexColumn', 'Table.DuplicateColumn', 'Table.AddJoinColumn', 'Table.AddKey', 'Table.CombineColumns', 'Table.SplitColumn', 'Table.TransformColumns', 'Table.ReplaceValue', 'Table.ReplaceErrorValues', 'Table.ReplaceRelationshipIdentity', 'Table.Buffer'],
  'remove-columns': ['Table.RemoveColumns', 'Table.SelectColumns', 'Table.ReorderColumns', 'Table.Transpose'],
  rename: ['Table.RenameColumns', 'Table.PrefixColumns'],
  types: ['Table.TransformColumnTypes', 'Table.TransformColumnNames'],
  group: ['Table.Group', 'Table.Profile', 'Table.Pivot', 'Table.UnpivotOtherColumns', 'Table.Unpivot', 'Table.Partition', 'Table.Max', 'Table.Min', 'Table.MaxN', 'Table.MinN'],
  merge: ['Table.NestedJoin', 'Table.Join', 'Table.FuzzyNestedJoin', 'Table.FuzzyJoin'],
  append: ['Table.Combine', 'Table.InsertRows', 'Table.FromRecords', 'Table.FromList', 'Table.FromRows', 'Table.FromColumns'],
  pivot: ['Table.PivotColumns', 'Table.Pivot'],
  expand: ['Table.ExpandTableColumn', 'Table.ExpandRecordColumn', 'Table.ExpandListColumn', 'Table.ToColumns', 'Table.ToRows', 'Table.ToList', 'Table.ToRecords'],
  promote: ['Table.PromoteHeaders', 'Table.DemoteHeaders']
};

const BY_NAME = new Map();
for (const [kind, names] of Object.entries(TABLE)) for (const n of names) BY_NAME.set(n, kind);
BY_NAME.set('Table.Pivot', 'pivot');
BY_NAME.set('Table.Unpivot', 'pivot');
BY_NAME.set('Table.UnpivotOtherColumns', 'pivot');

const SOURCE_PREFIX = /^(Excel|Csv|Web|Sql|Json|Xml|File|Folder|Odbc|OleDb|Access|SharePoint|Sap|Oracle|MySQL|PostgreSQL|Teradata|Salesforce|OData|AzureStorage|Cube|Exchange|Hdfs|Html|Pdf|Parquet|Lines|Binary|Text\.FromBinary|Table\.FromRows|Table\.FromColumns|Table\.FromRecords|Table\.FromList|DateTime\.LocalNow|Value\.NativeQuery)\b/;

export function kindOfCall(call) {
  if (!call) return 'custom';
  if (call === '#table') return 'source';
  const direct = BY_NAME.get(call);
  if (direct === 'append' && /^Table\.From/.test(call)) return 'source';
  if (direct) return direct;
  if (SOURCE_PREFIX.test(call)) return 'source';
  return 'custom';
}

export const STEP_KINDS = ['source', 'navigate', 'filter', 'sort', 'add-column', 'remove-columns', 'rename', 'types', 'group', 'merge', 'append', 'pivot', 'expand', 'promote', 'custom'];
