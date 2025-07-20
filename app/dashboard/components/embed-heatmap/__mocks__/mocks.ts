export const mockData: AggregatedCandidate[] = [
  {
    sourceColumn: 'Gender',
    targetColumn: 'gender',
    matchers: ['magneto_zs', 'magneto_ft'],
    score: 0.8,
    status: 'idle',
  },
  {
    sourceColumn: 'Age',
    targetColumn: 'age',
    matchers: ['magneto_zs', 'magneto_ft'],
    score: 0.8,
    status: 'idle',
  },
];

export const mockSourceColumns: SourceColumn[] = [
  { name: 'Gender', status: 'incomplete', maxScore: 0.9 },
  { name: 'Age', status: 'complete', maxScore: 0.85 },
];

export const mockTargetOntologies: Ontology[] = [
  {
    name: 'gender',
    parent: 'demographic',
    grandparent: 'clinical',
  },
  {
    name: 'age',
    parent: 'demographic',
    grandparent: 'clinical',
  },
]; 